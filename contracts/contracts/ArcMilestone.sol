// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title ArcMilestone
/// @notice Holds Arc's native USDC until a client approves submitted work or an
///         unsubmitted job passes its deadline.
/// @dev Arc exposes USDC both as a native asset and through an ERC-20 interface.
///      This contract deliberately uses only the native interface: deposits arrive
///      through msg.value and withdrawals leave through native value calls. Keeping
///      one interface avoids mixing native 18-decimal values with ERC-20 6-decimal
///      values that represent the same underlying Arc balance.
contract ArcMilestone {
  // =====================================================
  // SECTION 1: CUSTOM ERRORS
  // =====================================================
  //
  // Custom errors describe why a transaction failed while using less deployment
  // and execution gas than long revert strings. Arguments are included when they
  // help a frontend or developer identify the failed job, caller, or value.

  error ZeroFreelancerAddress();
  error ClientCannotBeFreelancer(address client);
  error ZeroPayment();
  error InvalidDeadline(uint256 providedDeadline, uint256 currentTimestamp);
  error EmptyMetadataHash();
  error EmptyDeliverableHash();
  error JobNotFound(uint256 jobId);
  error CallerIsNotClient(uint256 jobId, address caller);
  error CallerIsNotFreelancer(uint256 jobId, address caller);
  error WrongJobStatus(
    uint256 jobId,
    JobStatus currentStatus,
    JobStatus requiredStatus
  );
  error SubmissionDeadlinePassed(
    uint256 jobId,
    uint256 deadline,
    uint256 currentTimestamp
  );
  error RefundNotYetAvailable(
    uint256 jobId,
    uint256 deadline,
    uint256 currentTimestamp
  );
  error PaymentTransferFailed(uint256 jobId, address recipient, uint256 amount);
  error ReentrantCall();
  error DirectPaymentNotAllowed();

  // =====================================================
  // SECTION 2: JOB STATUS
  // =====================================================
  //
  // An enum gives each lifecycle state a readable name. Solidity stores these as
  // small integers, but callers can reason about Funded, WorkSubmitted, Completed,
  // and Refunded instead of unexplained numbers.
  //
  // Only these paths are valid:
  //   Funded -> WorkSubmitted -> Completed
  //   Funded -> Refunded
  // Restricting transitions is what prevents a second payout or refund.

  enum JobStatus {
    Funded,
    WorkSubmitted,
    Completed,
    Refunded
  }

  // =====================================================
  // SECTION 3: JOB STRUCTURE
  // =====================================================
  //
  // A struct groups every onchain fact needed for one escrow. bytes32 values are
  // fixed-size 32-byte hashes: the large job description and deliverable remain
  // offchain, while their hashes provide compact references and integrity checks.
  // No private user data or uploaded file is stored here.

  struct Job {
    uint256 id;
    address client;
    address freelancer;
    uint256 amount;
    uint256 deadline;
    bytes32 metadataHash;
    bytes32 deliverableHash;
    JobStatus status;
  }

  // =====================================================
  // SECTION 4: CONTRACT STORAGE
  // =====================================================
  //
  // A mapping acts like a key-value table from job ID to Job. It provides direct
  // lookup without an expensive loop. Mappings return an all-zero value for a
  // missing key, so every job-specific function must explicitly prove existence.

  uint256 private _jobCount;
  mapping(uint256 jobId => Job job) private _jobs;

  // totalLocked is the sum still owed by active escrows. It is public so Solidity
  // automatically creates a read function for the frontend and future indexer.
  uint256 public totalLocked;

  // The guard is false while no protected function is running. It becomes true
  // before a payment call and blocks a recipient from entering another protected
  // payout before the first one finishes.
  bool private _reentrancyEntered;

  // =====================================================
  // SECTION 5: EVENTS
  // =====================================================
  //
  // Events create transaction logs that the React frontend, Arc Explorer, and a
  // future Go listener can observe without repeatedly searching every storage slot.
  // indexed fields become searchable log topics. An event may have at most three
  // indexed application fields, so identities are indexed and data remains visible.

  event JobCreatedAndFunded(
    uint256 indexed jobId,
    address indexed client,
    address indexed freelancer,
    uint256 amount,
    uint256 deadline,
    bytes32 metadataHash
  );

  event WorkSubmitted(
    uint256 indexed jobId,
    address indexed freelancer,
    bytes32 deliverableHash
  );

  event PaymentReleased(
    uint256 indexed jobId,
    address indexed freelancer,
    uint256 amount
  );

  event JobRefunded(
    uint256 indexed jobId,
    address indexed client,
    uint256 amount
  );

  // =====================================================
  // SECTION 6: MODIFIERS
  // =====================================================
  //
  // Modifiers reuse short access checks without hiding the lifecycle rules. Status
  // and deadline decisions stay inside each function so their order remains easy
  // to study.

  modifier jobExists(uint256 jobId) {
    // IDs start at 1 and are sequential. Therefore zero or an ID above the latest
    // counter can never name a stored job.
    if (jobId == 0 || jobId > _jobCount) {
      revert JobNotFound(jobId);
    }
    _;
  }

  modifier onlyJobClient(uint256 jobId) {
    // msg.sender is the wallet or contract that directly called this function.
    // Unlike tx.origin, it remains safe and predictable across contract calls.
    if (msg.sender != _jobs[jobId].client) {
      revert CallerIsNotClient(jobId, msg.sender);
    }
    _;
  }

  modifier onlyAssignedFreelancer(uint256 jobId) {
    if (msg.sender != _jobs[jobId].freelancer) {
      revert CallerIsNotFreelancer(jobId, msg.sender);
    }
    _;
  }

  modifier nonReentrant() {
    // A value recipient can be a smart contract whose receive/fallback code runs
    // during our payment. Blocking nested payout entry removes that reentrancy path.
    if (_reentrancyEntered) {
      revert ReentrantCall();
    }

    _reentrancyEntered = true;
    _;
    _reentrancyEntered = false;
  }

  // =====================================================
  // SECTION 7: CREATE AND FUND A JOB
  // =====================================================

  /// @notice Creates a job and locks its complete payment in one transaction.
  /// @param freelancer The marketplace-selected wallet that may submit work.
  /// @param deadline The final Unix timestamp at which work may be submitted.
  /// @param metadataHash A hash of the offchain job metadata.
  /// @return jobId The new sequential job identifier.
  function createAndFundJob(
    address freelancer,
    uint256 deadline,
    bytes32 metadataHash
  ) external payable returns (uint256 jobId) {
    // =====================================================
    // STEP 1: VALIDATE THE PARTICIPANTS
    // =====================================================
    // The zero address has no usable private key, so assigning it would make valid
    // submission impossible. Separating client and freelancer also preserves the
    // intended two-party approval flow.

    if (freelancer == address(0)) {
      revert ZeroFreelancerAddress();
    }
    if (freelancer == msg.sender) {
      revert ClientCannotBeFreelancer(msg.sender);
    }

    // =====================================================
    // STEP 2: VALIDATE THE PAYMENT AND DEADLINE
    // =====================================================
    // payable lets this function receive Arc's native USDC. msg.value is the exact
    // native amount supplied with the call. Solidity uses integers, not floating
    // point numbers, so this amount is expressed in Arc's smallest native accounting
    // unit (18 decimal places). Zero would create an escrow with nothing to release.
    //
    // block.timestamp is the current block's Unix time. Requiring a later deadline
    // ensures the freelancer receives a real opportunity to submit after creation.

    if (msg.value == 0) {
      revert ZeroPayment();
    }
    if (deadline <= block.timestamp) {
      revert InvalidDeadline(deadline, block.timestamp);
    }

    // =====================================================
    // STEP 3: REQUIRE A METADATA REFERENCE
    // =====================================================
    // bytes32(0) is the empty hash sentinel. Rejecting it ensures every escrow has
    // a reference that the marketplace can connect to its offchain job record.

    if (metadataHash == bytes32(0)) {
      revert EmptyMetadataHash();
    }

    // =====================================================
    // STEP 4: CREATE A UNIQUE FUNDED JOB
    // =====================================================
    // Every agreement needs a unique ID or a later job could overwrite an earlier
    // one in the mapping. Incrementing first reserves ID zero as "not found."
    //
    // The job begins as Funded because creation and payment happen atomically: if
    // any check or storage operation reverts, the entire transaction—including the
    // native USDC transfer—reverts, so an unfunded onchain job is never created.

    jobId = ++_jobCount;
    _jobs[jobId] = Job({
      id: jobId,
      client: msg.sender,
      freelancer: freelancer,
      amount: msg.value,
      deadline: deadline,
      metadataHash: metadataHash,
      deliverableHash: bytes32(0),
      status: JobStatus.Funded
    });

    // =====================================================
    // STEP 5: UPDATE ACCOUNTING AND ANNOUNCE THE JOB
    // =====================================================
    // totalLocked tracks obligations, not merely address(this).balance. A forced or
    // otherwise unexpected balance must never be mistaken for a user's escrow.

    totalLocked += msg.value;

    // emit writes an event log. It does not call another contract or move funds.
    emit JobCreatedAndFunded(
      jobId,
      msg.sender,
      freelancer,
      msg.value,
      deadline,
      metadataHash
    );
  }

  // =====================================================
  // SECTION 8: SUBMIT WORK
  // =====================================================

  /// @notice Records the assigned freelancer's offchain deliverable hash.
  function submitWork(
    uint256 jobId,
    bytes32 deliverableHash
  ) external jobExists(jobId) onlyAssignedFreelancer(jobId) {
    // =====================================================
    // STEP 1: LOAD THE JOB AND CHECK ITS STATUS
    // =====================================================
    // A storage reference points to the persistent Job inside the mapping. Changes
    // made through this reference remain onchain after a successful transaction.

    Job storage job = _jobs[jobId];

    if (job.status != JobStatus.Funded) {
      revert WrongJobStatus(jobId, job.status, JobStatus.Funded);
    }

    // =====================================================
    // STEP 2: ENFORCE THE DELIVERY WINDOW
    // =====================================================
    // Work is valid at the exact deadline and invalid only after it. Validators set
    // block timestamps within protocol rules; neither party supplies this value.

    if (block.timestamp > job.deadline) {
      revert SubmissionDeadlinePassed(jobId, job.deadline, block.timestamp);
    }

    // =====================================================
    // STEP 3: STORE A REAL DELIVERABLE REFERENCE
    // =====================================================
    // The hash proves which offchain work was submitted without putting a file or
    // private URL on a public blockchain. An empty hash would prove nothing.

    if (deliverableHash == bytes32(0)) {
      revert EmptyDeliverableHash();
    }

    job.deliverableHash = deliverableHash;
    job.status = JobStatus.WorkSubmitted;

    // No payment leaves here. The client must separately review and approve.
    emit WorkSubmitted(jobId, msg.sender, deliverableHash);
  }

  // =====================================================
  // SECTION 9: APPROVE AND RELEASE PAYMENT
  // =====================================================

  /// @notice Lets the client approve submitted work and pay the freelancer.
  function approveAndRelease(
    uint256 jobId
  ) external jobExists(jobId) onlyJobClient(jobId) nonReentrant {
    // =====================================================
    // STEP 1: CHECK THAT WORK AWAITS APPROVAL
    // =====================================================

    Job storage job = _jobs[jobId];

    if (job.status != JobStatus.WorkSubmitted) {
      revert WrongJobStatus(jobId, job.status, JobStatus.WorkSubmitted);
    }

    // Read payment details before changing status so the external interaction uses
    // simple local values and does not need another storage lookup.
    uint256 amount = job.amount;
    address freelancer = job.freelancer;

    // =====================================================
    // STEP 2: APPLY EFFECTS BEFORE THE EXTERNAL CALL
    // =====================================================
    // This is Checks-Effects-Interactions: first validate, then finalize our state,
    // then interact with the recipient. A recipient contract therefore observes an
    // already-Completed job and cannot release it again during its callback.

    job.status = JobStatus.Completed;
    totalLocked -= amount;

    // =====================================================
    // STEP 3: TRANSFER THE COMPLETE ESCROW
    // =====================================================
    // payable marks the address as able to receive native value. call forwards the
    // amount and returns success=false instead of automatically hiding the failure.
    // Empty calldata means this is only a value transfer, not an arbitrary function
    // request chosen by a user.

    (bool success, ) = payable(freelancer).call{value: amount}("");
    if (!success) {
      revert PaymentTransferFailed(jobId, freelancer, amount);
    }

    // A revert rolls back every earlier state change in this transaction. Therefore,
    // if transfer fails, status returns to WorkSubmitted and totalLocked is restored.
    emit PaymentReleased(jobId, freelancer, amount);
  }

  // =====================================================
  // SECTION 10: REFUND AN EXPIRED JOB
  // =====================================================

  /// @notice Returns funds when no work was submitted before the deadline.
  function refundExpiredJob(
    uint256 jobId
  ) external jobExists(jobId) onlyJobClient(jobId) nonReentrant {
    // =====================================================
    // STEP 1: REQUIRE AN UNSUBMITTED FUNDED JOB
    // =====================================================
    // Version one has no dispute arbitrator. Once work is submitted, the client may
    // not unilaterally refund; only the approval path may resolve that escrow.

    Job storage job = _jobs[jobId];

    if (job.status != JobStatus.Funded) {
      revert WrongJobStatus(jobId, job.status, JobStatus.Funded);
    }

    // =====================================================
    // STEP 2: REQUIRE THE DEADLINE TO HAVE PASSED
    // =====================================================
    // Submission is allowed on the deadline, so refund begins strictly afterward.

    if (block.timestamp <= job.deadline) {
      revert RefundNotYetAvailable(jobId, job.deadline, block.timestamp);
    }

    uint256 amount = job.amount;
    address client = job.client;

    // =====================================================
    // STEP 3: FINALIZE STATE, THEN RETURN THE FUNDS
    // =====================================================
    // Refunded status makes this a one-time action. As in approval, effects happen
    // before interaction and a failed call reverts both the status and accounting.

    job.status = JobStatus.Refunded;
    totalLocked -= amount;

    (bool success, ) = payable(client).call{value: amount}("");
    if (!success) {
      revert PaymentTransferFailed(jobId, client, amount);
    }

    emit JobRefunded(jobId, client, amount);
  }

  // =====================================================
  // SECTION 11: READ-ONLY FUNCTIONS
  // =====================================================
  //
  // view means these calls read state without changing it. A frontend can normally
  // call them locally through an RPC node without sending a transaction or paying
  // gas. Returning one job at a time avoids an unbounded, gas-wasting storage loop;
  // events or sequential IDs can drive pagination and indexing.

  function getJob(uint256 jobId) external view jobExists(jobId) returns (Job memory) {
    // memory is a temporary copy used for this return value; changing the copy would
    // not change the persistent struct in storage.
    return _jobs[jobId];
  }

  function getJobCount() external view returns (uint256) {
    return _jobCount;
  }

  // =====================================================
  // SECTION 12: REJECT UNTRACKED PAYMENTS
  // =====================================================
  //
  // Native USDC must enter through createAndFundJob so every accepted amount has a
  // client, freelancer, deadline, and lifecycle. Plain sends and unknown function
  // calls revert instead of trapping funds outside totalLocked. These functions do
  // not claim protection against protocol-level forced balance changes; accounting
  // remains based only on recorded escrows.

  receive() external payable {
    revert DirectPaymentNotAllowed();
  }

  fallback() external payable {
    revert DirectPaymentNotAllowed();
  }
}
