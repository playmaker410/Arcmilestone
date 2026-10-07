import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, parseUnits, toBytes, zeroAddress } from "viem";

describe("ArcMilestone", async function () {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();

  const PAYMENT = parseUnits("125", 18);
  const SECOND_PAYMENT = parseUnits("75", 18);
  const ONE_DAY = 24n * 60n * 60n;
  const METADATA_HASH = keccak256(toBytes("ipfs://job-metadata"));
  const SECOND_METADATA_HASH = keccak256(toBytes("ipfs://second-job"));
  const DELIVERABLE_HASH = keccak256(toBytes("ipfs://submitted-work"));

  // JobStatus enum values (must match contract order)
  const STATUS_AWAITING_FREELANCER = 0;
  const STATUS_FUNDED = 1;
  const STATUS_WORK_SUBMITTED = 2;
  const STATUS_COMPLETED = 3;
  const STATUS_REFUNDED = 4;

  async function deployArcMilestoneFixture() {
    const [client, freelancer, stranger, secondFreelancer] =
      await viem.getWalletClients();
    const escrow = await viem.deployContract("ArcMilestone");
    const now = BigInt(await networkHelpers.time.latest());
    const deadline = now + ONE_DAY;

    return {
      client,
      freelancer,
      stranger,
      secondFreelancer,
      escrow,
      deadline,
    };
  }

  async function createOpenJob() {
    const fixture = await networkHelpers.loadFixture(
      deployArcMilestoneFixture,
    );
    const { client, escrow, deadline } = fixture;

    await escrow.write.createAndFundJobOpen(
      [deadline, METADATA_HASH],
      { account: client.account, value: PAYMENT },
    );

    return fixture;
  }

  async function createAssignedJob() {
    const fixture = await createOpenJob();
    const { client, freelancer, escrow } = fixture;

    await escrow.write.assignFreelancer(
      [1n, freelancer.account.address],
      { account: client.account },
    );

    return fixture;
  }

  async function createSubmittedJob() {
    const fixture = await createAssignedJob();
    const { freelancer, escrow } = fixture;

    await escrow.write.submitWork([1n, DELIVERABLE_HASH], {
      account: freelancer.account,
    });

    return fixture;
  }

  // =====================================================
  // CREATION AND FUNDING (open — freelancer assigned later)
  // =====================================================

  describe("createAndFundJobOpen", function () {
    it("creates a job with AwaitingFreelancer status and zero freelancer", async function () {
      const { escrow } = await createOpenJob();
      const job = await escrow.read.getJob([1n]);

      assert.equal(job.id, 1n);
      assert.equal(job.status, STATUS_AWAITING_FREELANCER);
      assert.equal(job.freelancer, zeroAddress);
      assert.equal(await escrow.read.getJobCount(), 1n);
    });

    it("stores the calling wallet as the client", async function () {
      const { client, escrow } = await createOpenJob();
      assert.equal(
        (await escrow.read.getJob([1n])).client.toLowerCase(),
        client.account.address.toLowerCase(),
      );
    });

    it("stores and holds the exact native USDC amount", async function () {
      const { escrow } = await createOpenJob();
      assert.equal((await escrow.read.getJob([1n])).amount, PAYMENT);
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        PAYMENT,
      );
    });

    it("increases totalLocked by the complete deposit", async function () {
      const { escrow } = await createOpenJob();
      assert.equal(await escrow.read.totalLocked(), PAYMENT);
    });

    it("emits JobCreatedAndFundedOpen with complete details", async function () {
      const { client, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.emitWithArgs(
        escrow.write.createAndFundJobOpen(
          [deadline, METADATA_HASH],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "JobCreatedAndFundedOpen",
        [1n, client.account.address, PAYMENT, deadline, METADATA_HASH],
      );
    });

    it("rejects zero payment", async function () {
      const { client, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomError(
        escrow.write.createAndFundJobOpen(
          [deadline, METADATA_HASH],
          { account: client.account, value: 0n },
        ),
        escrow,
        "ZeroPayment",
      );
    });

    it("rejects a current or expired deadline", async function () {
      const { client, escrow } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);
      const now = BigInt(await networkHelpers.time.latest());

      await viem.assertions.revertWithCustomError(
        escrow.write.createAndFundJobOpen(
          [now, METADATA_HASH],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "InvalidDeadline",
      );
    });

    it("rejects an empty metadata hash", async function () {
      const { client, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomError(
        escrow.write.createAndFundJobOpen(
          [deadline, `0x${"0".repeat(64)}`],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "EmptyMetadataHash",
      );
    });
  });

  // =====================================================
  // ASSIGN FREELANCER
  // =====================================================

  describe("assignFreelancer", function () {
    it("sets the freelancer and changes status to Funded", async function () {
      const { freelancer, escrow } = await createAssignedJob();
      const job = await escrow.read.getJob([1n]);

      assert.equal(job.freelancer.toLowerCase(), freelancer.account.address.toLowerCase());
      assert.equal(job.status, STATUS_FUNDED);
    });

    it("emits FreelancerAssigned", async function () {
      const { client, freelancer, escrow } = await createOpenJob();

      await viem.assertions.emitWithArgs(
        escrow.write.assignFreelancer(
          [1n, freelancer.account.address],
          { account: client.account },
        ),
        escrow,
        "FreelancerAssigned",
        [1n, client.account.address, freelancer.account.address],
      );
    });

    it("rejects assignment by a stranger", async function () {
      const { stranger, freelancer, escrow } = await createOpenJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.assignFreelancer(
          [1n, freelancer.account.address],
          { account: stranger.account },
        ),
        escrow,
        "CallerIsNotClient",
      );
    });

    it("rejects zero freelancer address", async function () {
      const { client, escrow } = await createOpenJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.assignFreelancer(
          [1n, zeroAddress],
          { account: client.account },
        ),
        escrow,
        "ZeroFreelancerAddress",
      );
    });

    it("rejects client assigning themselves", async function () {
      const { client, escrow } = await createOpenJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.assignFreelancer(
          [1n, client.account.address],
          { account: client.account },
        ),
        escrow,
        "ClientCannotBeFreelancer",
      );
    });

    it("rejects assignment on a job that already has a freelancer (Funded)", async function () {
      const { client, freelancer, secondFreelancer, escrow } = await createAssignedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.assignFreelancer(
          [1n, secondFreelancer.account.address],
          { account: client.account },
        ),
        escrow,
        "JobNotAwaitingFreelancer",
      );
    });

    it("allows submitWork after freelancer is assigned", async function () {
      const { freelancer, escrow } = await createAssignedJob();

      await escrow.write.submitWork([1n, DELIVERABLE_HASH], {
        account: freelancer.account,
      });

      assert.equal((await escrow.read.getJob([1n])).status, STATUS_WORK_SUBMITTED);
    });
  });

  // =====================================================
  // WORK SUBMISSION
  // =====================================================

  describe("submitWork", function () {
    it("lets the freelancer store a deliverable and change status", async function () {
      const { escrow } = await createSubmittedJob();
      const job = await escrow.read.getJob([1n]);

      assert.equal(job.deliverableHash, DELIVERABLE_HASH);
      assert.equal(job.status, STATUS_WORK_SUBMITTED);
      assert.equal(await escrow.read.totalLocked(), PAYMENT);
    });

    it("emits WorkSubmitted", async function () {
      const { freelancer, escrow } = await createAssignedJob();

      await viem.assertions.emitWithArgs(
        escrow.write.submitWork([1n, DELIVERABLE_HASH], {
          account: freelancer.account,
        }),
        escrow,
        "WorkSubmitted",
        [1n, freelancer.account.address, DELIVERABLE_HASH],
      );
    });

    it("rejects submission by the client", async function () {
      const { client, escrow } = await createAssignedJob();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.submitWork([1n, DELIVERABLE_HASH], {
          account: client.account,
        }),
        escrow,
        "CallerIsNotFreelancer",
        [1n, client.account.address],
      );
    });

    it("rejects submission by a stranger", async function () {
      const { stranger, escrow } = await createAssignedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.submitWork([1n, DELIVERABLE_HASH], {
          account: stranger.account,
        }),
        escrow,
        "CallerIsNotFreelancer",
      );
    });

    it("rejects submission on an AwaitingFreelancer job", async function () {
      const { client, escrow } = await createOpenJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.submitWork([1n, DELIVERABLE_HASH], {
          account: client.account,
        }),
        escrow,
        "CallerIsNotFreelancer",
      );
    });

    it("rejects an empty deliverable hash", async function () {
      const { freelancer, escrow } = await createAssignedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.submitWork([1n, `0x${"0".repeat(64)}`], {
          account: freelancer.account,
        }),
        escrow,
        "EmptyDeliverableHash",
      );
    });

    it("rejects submission after the deadline", async function () {
      const { freelancer, escrow, deadline } = await createAssignedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.revertWithCustomError(
        escrow.write.submitWork([1n, DELIVERABLE_HASH], {
          account: freelancer.account,
        }),
        escrow,
        "SubmissionDeadlinePassed",
      );
    });

    it("rejects a second work submission", async function () {
      const { freelancer, escrow } = await createSubmittedJob();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.submitWork([1n, SECOND_METADATA_HASH], {
          account: freelancer.account,
        }),
        escrow,
        "WrongJobStatus",
        [1n, STATUS_WORK_SUBMITTED, STATUS_FUNDED],
      );
    });
  });

  // =====================================================
  // CLIENT APPROVAL AND PAYMENT RELEASE
  // =====================================================

  describe("approveAndRelease", function () {
    it("rejects approval by the freelancer", async function () {
      const { freelancer, escrow } = await createSubmittedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.approveAndRelease([1n], { account: freelancer.account }),
        escrow,
        "CallerIsNotClient",
      );
    });

    it("rejects approval by a stranger", async function () {
      const { stranger, escrow } = await createSubmittedJob();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.approveAndRelease([1n], { account: stranger.account }),
        escrow,
        "CallerIsNotClient",
        [1n, stranger.account.address],
      );
    });

    it("requires WorkSubmitted status", async function () {
      const { client, escrow } = await createAssignedJob();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.approveAndRelease([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, STATUS_FUNDED, STATUS_WORK_SUBMITTED],
      );
    });

    it("pays the freelancer the exact escrow amount", async function () {
      const { client, freelancer, escrow } = await createSubmittedJob();

      await viem.assertions.balancesHaveChanged(
        escrow.write.approveAndRelease([1n], { account: client.account }),
        [
          { address: escrow.address, amount: -PAYMENT },
          { address: freelancer.account.address, amount: PAYMENT },
        ],
      );
    });

    it("marks Completed and decreases locked accounting", async function () {
      const { client, escrow } = await createSubmittedJob();
      await escrow.write.approveAndRelease([1n], { account: client.account });

      assert.equal((await escrow.read.getJob([1n])).status, STATUS_COMPLETED);
      assert.equal(await escrow.read.totalLocked(), 0n);
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        0n,
      );
    });

    it("emits PaymentReleased", async function () {
      const { client, freelancer, escrow } = await createSubmittedJob();

      await viem.assertions.emitWithArgs(
        escrow.write.approveAndRelease([1n], { account: client.account }),
        escrow,
        "PaymentReleased",
        [1n, freelancer.account.address, PAYMENT],
      );
    });

    it("cannot release the same payment twice", async function () {
      const { client, escrow } = await createSubmittedJob();
      await escrow.write.approveAndRelease([1n], { account: client.account });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.approveAndRelease([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, STATUS_COMPLETED, STATUS_WORK_SUBMITTED],
      );
    });
  });

  // =====================================================
  // EXPIRED-JOB REFUNDS
  // =====================================================

  describe("refundExpiredJob", function () {
    it("rejects a refund before the deadline", async function () {
      const { client, escrow } = await createAssignedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "RefundNotYetAvailable",
      );
    });

    it("rejects a refund by anyone except the client", async function () {
      const { stranger, escrow, deadline } = await createAssignedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundExpiredJob([1n], { account: stranger.account }),
        escrow,
        "CallerIsNotClient",
        [1n, stranger.account.address],
      );
    });

    it("returns the exact escrow amount after expiry (Funded job)", async function () {
      const { client, escrow, deadline } = await createAssignedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.balancesHaveChanged(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        [
          { address: escrow.address, amount: -PAYMENT },
          { address: client.account.address, amount: PAYMENT },
        ],
      );
    });

    it("refunds an AwaitingFreelancer job after deadline passes", async function () {
      const { client, escrow, deadline } = await createOpenJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.balancesHaveChanged(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        [
          { address: escrow.address, amount: -PAYMENT },
          { address: client.account.address, amount: PAYMENT },
        ],
      );
    });

    it("marks Refunded and decreases locked accounting (Funded job)", async function () {
      const { client, escrow, deadline } = await createAssignedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);
      await escrow.write.refundExpiredJob([1n], { account: client.account });

      assert.equal((await escrow.read.getJob([1n])).status, STATUS_REFUNDED);
      assert.equal(await escrow.read.totalLocked(), 0n);
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        0n,
      );
    });

    it("marks Refunded and decreases locked accounting (AwaitingFreelancer job)", async function () {
      const { client, escrow, deadline } = await createOpenJob();
      await networkHelpers.time.increaseTo(deadline + 1n);
      await escrow.write.refundExpiredJob([1n], { account: client.account });

      assert.equal((await escrow.read.getJob([1n])).status, STATUS_REFUNDED);
      assert.equal(await escrow.read.totalLocked(), 0n);
    });

    it("emits JobRefunded", async function () {
      const { client, escrow, deadline } = await createAssignedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.emitWithArgs(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "JobRefunded",
        [1n, client.account.address, PAYMENT],
      );
    });

    it("cannot refund the same job twice", async function () {
      const { client, escrow, deadline } = await createAssignedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);
      await escrow.write.refundExpiredJob([1n], { account: client.account });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, STATUS_REFUNDED, STATUS_FUNDED],
      );
    });

    it("cannot refund after work submission", async function () {
      const { client, escrow, deadline } = await createSubmittedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, STATUS_WORK_SUBMITTED, STATUS_FUNDED],
      );
    });
  });

  // =====================================================
  // CANCEL UNASSIGNED JOB (CLIENT CANCELS BEFORE ASSIGNMENT)
  // =====================================================

  describe("cancelUnassignedJob", function () {
    it("returns the exact escrow amount to the client", async function () {
      const { client, escrow } = await createOpenJob();

      await viem.assertions.balancesHaveChanged(
        escrow.write.cancelUnassignedJob([1n], { account: client.account }),
        [
          { address: escrow.address, amount: -PAYMENT },
          { address: client.account.address, amount: PAYMENT },
        ],
      );
    });

    it("marks the job as Refunded", async function () {
      const { client, escrow } = await createOpenJob();
      await escrow.write.cancelUnassignedJob([1n], { account: client.account });

      assert.equal((await escrow.read.getJob([1n])).status, STATUS_REFUNDED);
    });

    it("decreases totalLocked to zero", async function () {
      const { client, escrow } = await createOpenJob();
      await escrow.write.cancelUnassignedJob([1n], { account: client.account });

      assert.equal(await escrow.read.totalLocked(), 0n);
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        0n,
      );
    });

    it("emits JobRefunded", async function () {
      const { client, escrow } = await createOpenJob();

      await viem.assertions.emitWithArgs(
        escrow.write.cancelUnassignedJob([1n], { account: client.account }),
        escrow,
        "JobRefunded",
        [1n, client.account.address, PAYMENT],
      );
    });

    it("rejects cancellation by a stranger", async function () {
      const { stranger, escrow } = await createOpenJob();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.cancelUnassignedJob([1n], { account: stranger.account }),
        escrow,
        "CallerIsNotClient",
        [1n, stranger.account.address],
      );
    });

    it("rejects cancellation once a freelancer is assigned (Funded status)", async function () {
      const { client, escrow } = await createAssignedJob();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.cancelUnassignedJob([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, STATUS_FUNDED, STATUS_AWAITING_FREELANCER],
      );
    });

    it("rejects a second cancellation on the same job", async function () {
      const { client, escrow } = await createOpenJob();
      await escrow.write.cancelUnassignedJob([1n], { account: client.account });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.cancelUnassignedJob([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, STATUS_REFUNDED, STATUS_AWAITING_FREELANCER],
      );
    });

    it("can cancel before deadline — no deadline check", async function () {
      // Job is freshly created, far from its deadline — should succeed immediately.
      const { client, escrow } = await createOpenJob();

      // No time advance — deadline has not passed. Cancel should still work.
      await escrow.write.cancelUnassignedJob([1n], { account: client.account });
      assert.equal((await escrow.read.getJob([1n])).status, STATUS_REFUNDED);
    });
  });

  // =====================================================
  // READS, DIRECT TRANSFERS, AND MULTIPLE JOBS
  // =====================================================

  describe("escrow integrity", function () {
    it("rejects nonexistent IDs in read and write functions", async function () {
      const { freelancer, escrow } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.read.getJob([0n]),
        escrow,
        "JobNotFound",
        [0n],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.submitWork([99n, DELIVERABLE_HASH], {
          account: freelancer.account,
        }),
        escrow,
        "JobNotFound",
        [99n],
      );
    });

    it("rejects a plain untracked native payment", async function () {
      const { client, escrow } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomError(
        client.sendTransaction({ to: escrow.address, value: PAYMENT }),
        escrow,
        "DirectPaymentNotAllowed",
      );
    });

    it("creates multiple jobs with sequential unique IDs", async function () {
      const { client, freelancer, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await escrow.write.createAndFundJobOpen([deadline, METADATA_HASH], {
        account: client.account,
        value: PAYMENT,
      });
      await escrow.write.createAndFundJobOpen(
        [deadline, SECOND_METADATA_HASH],
        { account: client.account, value: SECOND_PAYMENT },
      );
      await escrow.write.assignFreelancer([1n, freelancer.account.address], {
        account: client.account,
      });

      assert.equal((await escrow.read.getJob([1n])).id, 1n);
      assert.equal((await escrow.read.getJob([2n])).id, 2n);
      assert.equal(await escrow.read.getJobCount(), 2n);
      assert.equal(await escrow.read.totalLocked(), PAYMENT + SECOND_PAYMENT);
    });

    it("isolates jobs and keeps totalLocked accurate", async function () {
      const { client, freelancer, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await escrow.write.createAndFundJobOpen([deadline, METADATA_HASH], {
        account: client.account,
        value: PAYMENT,
      });
      await escrow.write.createAndFundJobOpen(
        [deadline, SECOND_METADATA_HASH],
        { account: client.account, value: SECOND_PAYMENT },
      );
      await escrow.write.assignFreelancer([1n, freelancer.account.address], {
        account: client.account,
      });
      await escrow.write.submitWork([1n, DELIVERABLE_HASH], {
        account: freelancer.account,
      });
      await escrow.write.approveAndRelease([1n], { account: client.account });

      const untouchedJob = await escrow.read.getJob([2n]);
      assert.equal(untouchedJob.status, STATUS_AWAITING_FREELANCER);
      assert.equal(untouchedJob.amount, SECOND_PAYMENT);
      assert.equal(await escrow.read.totalLocked(), SECOND_PAYMENT);

      await networkHelpers.time.increaseTo(deadline + 1n);
      await escrow.write.refundExpiredJob([2n], { account: client.account });

      assert.equal((await escrow.read.getJob([1n])).status, STATUS_COMPLETED);
      assert.equal((await escrow.read.getJob([2n])).status, STATUS_REFUNDED);
      assert.equal(await escrow.read.totalLocked(), 0n);
    });
  });
});
