// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/finance/InsuranceEscrow.sol";

contract InsuranceEscrowTest is Test {

    InsuranceEscrow escrow;

    address owner = address(1);
    address patient = address(2);
    address hospital = address(3);
    address insurance = address(4);

    function setUp() public {
        vm.prank(owner);
        escrow = new InsuranceEscrow(owner);

        vm.deal(patient, 10 ether);
        vm.deal(hospital, 10 ether);
        vm.deal(insurance, 10 ether);
    }

    function testLockFunds() public {
        vm.prank(patient);

        uint256 escrowId =
            escrow.lockFunds{value: 1 ether}(hospital, insurance);

        InsuranceEscrow.Escrow memory e =
            escrow.getEscrow(escrowId);

        assertEq(e.patient, patient);
        assertEq(e.hospital, hospital);
        assertEq(e.insurance, insurance);
        assertEq(e.amount, 1 ether);
        assertEq(uint(e.status), 1); // LOCKED
    }

    function testMultiApprovalRelease() public {
        vm.prank(patient);
        uint256 escrowId =
            escrow.lockFunds{value: 1 ether}(hospital, insurance);

        // Hospital approves
        vm.prank(hospital);
        escrow.approveByHospital(escrowId);

        // Insurance approves
        vm.prank(insurance);
        escrow.approveByInsurance(escrowId);

        InsuranceEscrow.Escrow memory e =
            escrow.getEscrow(escrowId);

        assertEq(uint(e.status), 2); // RELEASED
    }

    function testRefund() public {
        vm.prank(patient);
        uint256 escrowId =
            escrow.lockFunds{value: 1 ether}(hospital, insurance);

        vm.prank(owner);
        escrow.refund(escrowId);

        InsuranceEscrow.Escrow memory e =
            escrow.getEscrow(escrowId);

        assertEq(uint(e.status), 3); // REFUNDED
    }
}