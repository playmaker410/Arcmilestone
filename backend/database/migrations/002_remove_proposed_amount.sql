-- Migration 002: Remove proposed_amount from applications
-- Target: MySQL 8.0+ (the arcmilestone database must already be selected).
--
-- Rationale: In the v1 PoC the client funds the escrow with a fixed amount
-- before freelancers apply. Freelancers apply for the already-funded amount;
-- they do not propose a counter-amount. The column and its CHECK constraint
-- are therefore removed from the applications table.
--
-- Apply in DBeaver by opening this file and executing against the arcmilestone
-- database. Verify no data loss is acceptable before running on any
-- environment with existing application rows you wish to preserve.

ALTER TABLE applications
    DROP CONSTRAINT chk_applications_proposed_amount_positive,
    DROP COLUMN proposed_amount;
