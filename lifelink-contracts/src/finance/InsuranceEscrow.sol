// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract InsuranceEscrow is Ownable {

    enum EscrowStatus {
        NONE,
        LOCKED,
        RELEASED,
        REFUNDED
    }

    struct Escrow {
        address patient;
        address hospital;
        address insurance;
        uint256 amount;
        bool hospitalApproved;
        bool insuranceApproved;
        EscrowStatus status;
    }

    uint256 public escrowCounter;

    mapping(uint256 => Escrow) public escrows;

    event FundsLocked(
        uint256 indexed escrowId,
        address indexed patient,
        address indexed hospital,
        address insurance,
        uint256 amount
    );

    event HospitalApproved(uint256 indexed escrowId);
    event InsuranceApproved(uint256 indexed escrowId);
    event FundsReleased(uint256 indexed escrowId);
    event FundsRefunded(uint256 indexed escrowId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    // =============================
    // LOCK FUNDS
    // =============================

    function lockFunds(
        address _hospital,
        address _insurance
    ) external payable returns (uint256) {

        require(msg.value > 0, "Amount must be > 0");
        require(_hospital != address(0), "Invalid hospital");
        require(_insurance != address(0), "Invalid insurance");

        escrowCounter++;

        escrows[escrowCounter] = Escrow({
            patient: msg.sender,
            hospital: _hospital,
            insurance: _insurance,
            amount: msg.value,
            hospitalApproved: false,
            insuranceApproved: false,
            status: EscrowStatus.LOCKED
        });

        emit FundsLocked(
            escrowCounter,
            msg.sender,
            _hospital,
            _insurance,
            msg.value
        );

        return escrowCounter;
    }

    // =============================
    // HOSPITAL APPROVES TREATMENT
    // =============================

    function approveByHospital(uint256 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];

        require(msg.sender == escrow.hospital, "Only hospital");
        require(escrow.status == EscrowStatus.LOCKED, "Invalid status");

        escrow.hospitalApproved = true;

        emit HospitalApproved(_escrowId);

        _tryRelease(_escrowId);
    }

    // =============================
    // INSURANCE APPROVES CLAIM
    // =============================

    function approveByInsurance(uint256 _escrowId) external {
        Escrow storage escrow = escrows[_escrowId];

        require(msg.sender == escrow.insurance, "Only insurance");
        require(escrow.status == EscrowStatus.LOCKED, "Invalid status");

        escrow.insuranceApproved = true;

        emit InsuranceApproved(_escrowId);

        _tryRelease(_escrowId);
    }

    // =============================
    // INTERNAL RELEASE LOGIC
    // =============================

    function _tryRelease(uint256 _escrowId) internal {
        Escrow storage escrow = escrows[_escrowId];

        if (escrow.hospitalApproved && escrow.insuranceApproved) {

            escrow.status = EscrowStatus.RELEASED;

            (bool success, ) =
                escrow.hospital.call{value: escrow.amount}("");
            require(success, "Transfer failed");

            emit FundsReleased(_escrowId);
        }
    }

    // =============================
    // ADMIN REFUND
    // =============================

    function refund(uint256 _escrowId) external onlyOwner {
        Escrow storage escrow = escrows[_escrowId];

        require(escrow.status == EscrowStatus.LOCKED, "Invalid status");

        escrow.status = EscrowStatus.REFUNDED;

        (bool success, ) =
            escrow.patient.call{value: escrow.amount}("");
        require(success, "Refund failed");

        emit FundsRefunded(_escrowId);
    }

    // =============================
    // VIEW HELPER
    // =============================

    function getEscrow(uint256 _escrowId)
        external
        view
        returns (Escrow memory)
    {
        return escrows[_escrowId];
    }
}