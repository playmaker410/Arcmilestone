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

  async function createFundedJob() {
    const fixture = await networkHelpers.loadFixture(
      deployArcMilestoneFixture,
    );
    const { client, freelancer, escrow, deadline } = fixture;

    await escrow.write.createAndFundJob(
      [freelancer.account.address, deadline, METADATA_HASH],
      { account: client.account, value: PAYMENT },
    );

    return fixture;
  }

  async function createSubmittedJob() {
    const fixture = await createFundedJob();
    const { freelancer, escrow } = fixture;

    await escrow.write.submitWork([1n, DELIVERABLE_HASH], {
      account: freelancer.account,
    });

    return fixture;
  }

  // =====================================================
  // CREATION AND FUNDING
  // =====================================================

  describe("createAndFundJob", function () {
    it("creates one funded job and stores sequential ID 1", async function () {
      const { escrow } = await createFundedJob();
      const job = await escrow.read.getJob([1n]);

      assert.equal(job.id, 1n);
      assert.equal(job.status, 0);
      assert.equal(await escrow.read.getJobCount(), 1n);
    });

    it("stores the calling wallet as the client", async function () {
      const { client, escrow } = await createFundedJob();
      assert.equal(
        (await escrow.read.getJob([1n])).client.toLowerCase(),
        client.account.address.toLowerCase(),
      );
    });

    it("stores the selected freelancer", async function () {
      const { freelancer, escrow } = await createFundedJob();
      assert.equal(
        (await escrow.read.getJob([1n])).freelancer.toLowerCase(),
        freelancer.account.address.toLowerCase(),
      );
    });

    it("stores and holds the exact native USDC amount", async function () {
      const { escrow } = await createFundedJob();
      assert.equal((await escrow.read.getJob([1n])).amount, PAYMENT);
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        PAYMENT,
      );
    });

    it("stores deadline, metadata, and an empty deliverable", async function () {
      const { escrow, deadline } = await createFundedJob();
      const job = await escrow.read.getJob([1n]);

      assert.equal(job.deadline, deadline);
      assert.equal(job.metadataHash, METADATA_HASH);
      assert.equal(job.deliverableHash, `0x${"0".repeat(64)}`);
    });

    it("increases totalLocked by the complete deposit", async function () {
      const { escrow } = await createFundedJob();
      assert.equal(await escrow.read.totalLocked(), PAYMENT);
    });

    it("emits JobCreatedAndFunded with complete details", async function () {
      const { client, freelancer, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.emitWithArgs(
        escrow.write.createAndFundJob(
          [freelancer.account.address, deadline, METADATA_HASH],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "JobCreatedAndFunded",
        [
          1n,
          client.account.address,
          freelancer.account.address,
          PAYMENT,
          deadline,
          METADATA_HASH,
        ],
      );
    });

    it("rejects the zero freelancer address", async function () {
      const { client, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomError(
        escrow.write.createAndFundJob(
          [zeroAddress, deadline, METADATA_HASH],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "ZeroFreelancerAddress",
      );
    });

    it("rejects a client who hires themselves", async function () {
      const { client, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.createAndFundJob(
          [client.account.address, deadline, METADATA_HASH],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "ClientCannotBeFreelancer",
        [client.account.address],
      );
    });

    it("rejects zero payment", async function () {
      const { client, freelancer, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomError(
        escrow.write.createAndFundJob(
          [freelancer.account.address, deadline, METADATA_HASH],
          { account: client.account, value: 0n },
        ),
        escrow,
        "ZeroPayment",
      );
    });

    it("rejects a current or expired deadline", async function () {
      const { client, freelancer, escrow } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);
      const now = BigInt(await networkHelpers.time.latest());

      await viem.assertions.revertWithCustomError(
        escrow.write.createAndFundJob(
          [freelancer.account.address, now, METADATA_HASH],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "InvalidDeadline",
      );
    });

    it("rejects an empty metadata hash", async function () {
      const { client, freelancer, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await viem.assertions.revertWithCustomError(
        escrow.write.createAndFundJob(
          [freelancer.account.address, deadline, `0x${"0".repeat(64)}`],
          { account: client.account, value: PAYMENT },
        ),
        escrow,
        "EmptyMetadataHash",
      );
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
      assert.equal(job.status, 1);
      assert.equal(await escrow.read.totalLocked(), PAYMENT);
    });

    it("emits WorkSubmitted", async function () {
      const { freelancer, escrow } = await createFundedJob();

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
      const { client, escrow } = await createFundedJob();

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
      const { stranger, escrow } = await createFundedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.submitWork([1n, DELIVERABLE_HASH], {
          account: stranger.account,
        }),
        escrow,
        "CallerIsNotFreelancer",
      );
    });

    it("rejects an empty deliverable hash", async function () {
      const { freelancer, escrow } = await createFundedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.submitWork([1n, `0x${"0".repeat(64)}`], {
          account: freelancer.account,
        }),
        escrow,
        "EmptyDeliverableHash",
      );
    });

    it("rejects submission after the deadline", async function () {
      const { freelancer, escrow, deadline } = await createFundedJob();
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
        [1n, 1, 0],
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
      const { client, escrow } = await createFundedJob();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.approveAndRelease([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, 0, 1],
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

      assert.equal((await escrow.read.getJob([1n])).status, 2);
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
        [1n, 2, 1],
      );
    });
  });

  // =====================================================
  // EXPIRED-JOB REFUNDS
  // =====================================================

  describe("refundExpiredJob", function () {
    it("rejects a refund before the deadline", async function () {
      const { client, escrow } = await createFundedJob();

      await viem.assertions.revertWithCustomError(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "RefundNotYetAvailable",
      );
    });

    it("rejects a refund by anyone except the client", async function () {
      const { stranger, escrow, deadline } = await createFundedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundExpiredJob([1n], { account: stranger.account }),
        escrow,
        "CallerIsNotClient",
        [1n, stranger.account.address],
      );
    });

    it("returns the exact escrow amount after expiry", async function () {
      const { client, escrow, deadline } = await createFundedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.balancesHaveChanged(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        [
          { address: escrow.address, amount: -PAYMENT },
          { address: client.account.address, amount: PAYMENT },
        ],
      );
    });

    it("marks Refunded and decreases locked accounting", async function () {
      const { client, escrow, deadline } = await createFundedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);
      await escrow.write.refundExpiredJob([1n], { account: client.account });

      assert.equal((await escrow.read.getJob([1n])).status, 3);
      assert.equal(await escrow.read.totalLocked(), 0n);
      assert.equal(
        await publicClient.getBalance({ address: escrow.address }),
        0n,
      );
    });

    it("emits JobRefunded", async function () {
      const { client, escrow, deadline } = await createFundedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.emitWithArgs(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "JobRefunded",
        [1n, client.account.address, PAYMENT],
      );
    });

    it("cannot refund the same job twice", async function () {
      const { client, escrow, deadline } = await createFundedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);
      await escrow.write.refundExpiredJob([1n], { account: client.account });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, 3, 0],
      );
    });

    it("cannot refund after work submission", async function () {
      const { client, escrow, deadline } = await createSubmittedJob();
      await networkHelpers.time.increaseTo(deadline + 1n);

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundExpiredJob([1n], { account: client.account }),
        escrow,
        "WrongJobStatus",
        [1n, 1, 0],
      );
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
      const { client, freelancer, secondFreelancer, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await escrow.write.createAndFundJob(
        [freelancer.account.address, deadline, METADATA_HASH],
        { account: client.account, value: PAYMENT },
      );
      await escrow.write.createAndFundJob(
        [secondFreelancer.account.address, deadline, SECOND_METADATA_HASH],
        { account: client.account, value: SECOND_PAYMENT },
      );

      assert.equal((await escrow.read.getJob([1n])).id, 1n);
      assert.equal((await escrow.read.getJob([2n])).id, 2n);
      assert.equal(await escrow.read.getJobCount(), 2n);
      assert.equal(await escrow.read.totalLocked(), PAYMENT + SECOND_PAYMENT);
    });

    it("isolates jobs and keeps totalLocked accurate", async function () {
      const { client, freelancer, secondFreelancer, escrow, deadline } =
        await networkHelpers.loadFixture(deployArcMilestoneFixture);

      await escrow.write.createAndFundJob(
        [freelancer.account.address, deadline, METADATA_HASH],
        { account: client.account, value: PAYMENT },
      );
      await escrow.write.createAndFundJob(
        [secondFreelancer.account.address, deadline, SECOND_METADATA_HASH],
        { account: client.account, value: SECOND_PAYMENT },
      );
      await escrow.write.submitWork([1n, DELIVERABLE_HASH], {
        account: freelancer.account,
      });
      await escrow.write.approveAndRelease([1n], { account: client.account });

      const untouchedJob = await escrow.read.getJob([2n]);
      assert.equal(untouchedJob.status, 0);
      assert.equal(untouchedJob.amount, SECOND_PAYMENT);
      assert.equal(await escrow.read.totalLocked(), SECOND_PAYMENT);

      await networkHelpers.time.increaseTo(deadline + 1n);
      await escrow.write.refundExpiredJob([2n], { account: client.account });

      assert.equal((await escrow.read.getJob([1n])).status, 2);
      assert.equal((await escrow.read.getJob([2n])).status, 3);
      assert.equal(await escrow.read.totalLocked(), 0n);
    });
  });
});
