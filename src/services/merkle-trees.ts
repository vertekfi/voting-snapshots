import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import fs from 'fs-extra';

class MerkleTreeService {
  constructor() {
    const values = [
      ['0x1111111111111111111111111111111111111111', '5000000000000000000'],
      ['0x2222222222222222222222222222222222222222', '2500000000000000000'],
    ];

    const tree = StandardMerkleTree.of(values, ['address', 'uint256']);
    console.log('Merkle Root:', tree.root);
  }
}

export const merkleTreeService = new MerkleTreeService();
