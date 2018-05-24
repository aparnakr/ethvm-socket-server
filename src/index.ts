import configs from '@/configs'
import * as http from 'http'
import RethinkDB from '@/rethinkConn'
import addEvents from '@/addEvents'
import * as SocketIO from 'socket.io'
import ds from '@/datastores'
import { argv } from 'yargs'
import CacheDB from '@/vm/cacheDB'
import VmRunner from '@/vm/vmRunner'
import VmEngine from '@/vm/vmEngine'

import { blockLayout } from '@/typeLayouts'

if(argv.resetDS) ds.initialize()
const server:http.Server = http.createServer();

const io = require('socket.io')(server, configs.global.SOCKET_IO);
server.listen(configs.global.SOCKET_IO.port, configs.global.SOCKET_IO.ip, () => {
	console.log("Listening on", configs.global.SOCKET_IO.port)
});
let cacheDB = new CacheDB(configs.global.REDIS.URL, {
	port: configs.global.GETH_RPC.port,
	host: configs.global.GETH_RPC.host
})
let vmRunner = new VmRunner(cacheDB);
let rdb = new RethinkDB(io, vmRunner)
ds.getBlocks((_blocks: Array<blockLayout>)=>{
	vmRunner.setStateRoot(_blocks && _blocks[0] && _blocks[0].stateRoot ? new Buffer(_blocks[0].stateRoot) : new Buffer('d7f8974fb5ac78d9ac099b9ad5018bedc2ce0a72dad1827a1709da30580f0544', 'hex')) //genesis state by default
})
console.log("Start VmEngine")
VmEngine.start()
io.on('connection', (_socket: SocketIO.Socket) => {
	addEvents(_socket, rdb, vmRunner,VmEngine)
});
