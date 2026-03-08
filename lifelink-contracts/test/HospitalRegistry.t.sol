// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/HospitalRegistry.sol";

contract HospitalRegistryTest is Test {

    HospitalRegistry registry;

    address owner = address(1);
    address hospital = address(2);
    address oracle = address(3);

    function setUp() public {
        vm.prank(owner);
        registry = new HospitalRegistry(owner);
    }

    function testRegisterHospital() public {
        vm.prank(owner);
        registry.registerHospital(
            hospital,
            "AIIMS Trauma Center",
            "Delhi",
            true
        );

        (string memory name,, bool isVerified,,) = registry.hospitals(hospital);

        assertEq(name, "AIIMS Trauma Center");
        assertEq(isVerified, false);
    }

    function testVerifyHospital() public {
        vm.startPrank(owner);

        registry.registerHospital(
            hospital,
            "AIIMS Trauma Center",
            "Delhi",
            true
        );

        registry.verifyHospital(hospital);

        vm.stopPrank();

        bool verified = registry.isHospitalVerified(hospital);
        assertTrue(verified);
    }

    function testOnlyOwnerCanRegister() public {
        vm.expectRevert();
        registry.registerHospital(
            hospital,
            "Fake Hospital",
            "Nowhere",
            false
        );
    }

    function testOracleUpdate() public {
        vm.startPrank(owner);

        registry.registerHospital(
            hospital,
            "AIIMS Trauma Center",
            "Delhi",
            true
        );

        registry.verifyHospital(hospital);
        vm.stopPrank();

        vm.prank(hospital);
        registry.updateOracleSigner(oracle);

        (, , , , address storedOracle) = registry.hospitals(hospital);

        assertEq(storedOracle, oracle);
    }
}