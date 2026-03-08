// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract HospitalRegistry is Ownable {

    struct Hospital {
        string name;
        string location;
        bool isVerified;
        bool traumaCapable;
        address oracleSigner; // trusted data signer
    }

    mapping(address => Hospital) public hospitals;

    event HospitalRegistered(address indexed hospital);
    event HospitalVerified(address indexed hospital);
    event OracleUpdated(address indexed hospital, address newOracle);

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyVerifiedHospital() {
        require(hospitals[msg.sender].isVerified, "Not verified hospital");
        _;
    }

    function registerHospital(
        address _hospitalAddr,
        string memory _name,
        string memory _location,
        bool _traumaCapable
    ) external onlyOwner {
        require(bytes(hospitals[_hospitalAddr].name).length == 0, "Already registered");

        hospitals[_hospitalAddr] = Hospital({
            name: _name,
            location: _location,
            isVerified: false,
            traumaCapable: _traumaCapable,
            oracleSigner: address(0)
        });

        emit HospitalRegistered(_hospitalAddr);
    }

    function verifyHospital(address _hospitalAddr) external onlyOwner {
        require(bytes(hospitals[_hospitalAddr].name).length > 0, "Hospital not registered");
        hospitals[_hospitalAddr].isVerified = true;

        emit HospitalVerified(_hospitalAddr);
    }

    function updateOracleSigner(address _oracleSigner) external onlyVerifiedHospital {
        hospitals[msg.sender].oracleSigner = _oracleSigner;

        emit OracleUpdated(msg.sender, _oracleSigner);
    }

    function isHospitalVerified(address _hospital) external view returns (bool) {
        return hospitals[_hospital].isVerified;
    }
}