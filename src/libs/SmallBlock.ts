import { blockLayout, txLayout } from '@/typeLayouts'
import { common } from '@/libs'
import bn from 'bignumber.js'

class SmallBlock {
	block: blockLayout
	constructor(_block: blockLayout) {
		this.block = _block
	}
	hash(): string {
		return '0x' + new Buffer(this.block.hash).toString('hex')
	}
	smallify(): blockLayout {
		let _block = this.block
		return {
			number: _block.number,
			intNumber: _block.intNumber,
			hash: _block.hash,
			miner: _block.miner,
			timestamp: _block.timestamp,
			transactionCount: _block.transactionHashes.length,
			uncleHashes: _block.uncleHashes,
			isUncle: _block.isUncle,
			totalBlockReward: Buffer.from(new bn(common.bufferToHex(_block.blockReward)).plus(new bn(common.bufferToHex(_block.txFees))).plus(new bn(common.bufferToHex(_block.uncleReward))).toString(16), 'hex'),
			blockReward: _block.blockReward,
			txFees: _block.txFees,
			stateRoot: _block.stateRoot,
			uncleReward: _block.uncleReward,
			difficulty: _block.difficulty,
			blockStats: _block.blockStats
		}
	}
}

export default SmallBlock