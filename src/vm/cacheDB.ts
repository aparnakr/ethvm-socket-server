/*
get(key: Buffer, options: IencOptions, cb: ImyCallbackType) : A function of class CacheDB that
tries to get from Redis and if that doesnt work gets from get rpc.
put(key: Buffer, val: Buffer, options: IencOptions, cb: ImyCallbackType) :calls cb(null, true)
batch(ops: Array<IputValues>, options: IencOptions, cb: ImyCallbackType): calls cb(null, true)
del(key: Buffer, cb: ImyCallbackType): calls cb(null, true)
*/
import * as Redis from 'ioredis'
import * as rpc from 'json-rpc2'
interface ImyCallbackType { (err: Error, result: any): any }
interface IencOptions {
	keyEncoding: string;
	valueEncoding: string;
}
interface IrpcOptions {
	port: number;
	host: string;
}
interface IputValues {
	type: string,
	key: Buffer,
	value: Buffer
}
class CacheDB {
	redisConn: any;
	rpcConn: any;
	curState: string;
	constructor (_redis: string, _rpc: IrpcOptions) {
		this.redisConn = new Redis(_redis)
		this.rpcConn = rpc.Client.$create(_rpc.port, _rpc.host)
	}
	get(key: Buffer, options: IencOptions, cb: ImyCallbackType) {
		let _this = this
		// calls get from the Redis database , as a fallback calls the GETH_rpc
		this.redisConn.get(key, (err: Error, result: string) => {
			if (!err && result) {
				cb(null, new Buffer(result, 'hex'))
			}
			else {
				this.rpcConn.call('eth_getKeyValue', ['0x' + key.toString('hex')], function(err: Error, result: string) {
					if (err) {
						cb(err, null)
					}
					else {
						let resBuf: Buffer = new Buffer(result.substring(2),'hex')
						_this.redisConn.set(key, resBuf.toString('hex'))
						cb(null, resBuf)
					}
				})
			}
		})
	}

	put(key: Buffer, val: Buffer, options: IencOptions, cb: ImyCallbackType){ cb(null, true) }
	batch(ops: Array<IputValues>, options: IencOptions, cb: ImyCallbackType){
		cb(null, true)
	}
	del(key: Buffer, cb: ImyCallbackType) { cb(null, true) }
	isOpen():boolean { return true}
}
export default CacheDB
