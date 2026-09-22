// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CaseAnchor {
    mapping(string => string) public anchors;
    event Anchored(string indexed caseId, string chainHash, uint256 timestamp);

    function anchorHash(string memory caseId, string memory chainHash) public {
        anchors[caseId] = chainHash;
        emit Anchored(caseId, chainHash, block.timestamp);
    }

    function getAnchor(string memory caseId) public view returns (string memory) {
        return anchors[caseId];
    }
}