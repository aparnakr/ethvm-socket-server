/**
constructor(_socketIO: any, _vmR: VmRunner): initializes the socketIO connection, vmRunner, and calls start()
start(): takes care of connections to ports - depending on agruements passed in, connects with or without cert
setAllEvents(): creates changefeeds for blocks and txns, emitting block & txn updates to socket client,
getAddressTransactionPages(address: Buffer, hash: Buffer, bNumber: number, cb: (err: Error, result: any) => void): given and address, hash, & block number, orders & returns txns by number and hash that have come to or from that address
getTransactionPages(hash: Buffer, bNumber: number, cb(err: Error, results: any) => void): same as above, but not for specific getAddressTransactionPages
getBlockTransactions(hash: string, cb(err: Error, result: any) => void): given the hash of a block, gets txns from that block
getTotalTxs(hash: string, cb: (err: Error, result: any) => void): gets all txns starting from a certain hash
getTxnsOfAddress(hash: string, cb: (err: Error, result: any) => void): given an addr, gets txns from that addr
getBlock(hash: string, cb: (err: Error, result: any) => void): given a hash, gets the corresponding block
getTx(hash: string, cb: (err: Error, result: any) => void): given a hash, gets the corresponding txn
onNewBlock(_block: blockLayout): socket emits that there is a new block to clients & adds block to redis
onNewTx(_tx txLayout | Array<txLayout>): socket emits that there is a new txn & adds txn to redis
**/

import * as r from 'rethinkdb' //'rethinkdb' is node module, thus getting all rethink methods
import configs from '@/configs'
import * as fs from 'fs'
import { URL } from 'url'
import { argv } from 'yargs' //'yargs' is a nmp library to build easier command line commands / interface
import _ from 'lodash'
import ds from '@/datastores'
import { txLayout, blockLayout, chartLayout } from '@/typeLayouts'
import { SmallBlock, SmallTx, BlockStats, common } from '@/libs'
import VmRunner from '@/vm/vmRunner'
class RethinkDB {
    socketIO: any
    dbConn: r.Connection // connection to RETHINKdb
    tempTxs: Array<txLayout>
    numPendingTxs: number
    vmRunner: VmRunner // connection to geth rpc
    constructor(_socketIO: any, _vmR: VmRunner) {
        this.socketIO = _socketIO
        this.vmRunner = _vmR
        this.start()
    }
    start(): void {
        let _this = this
        this.tempTxs = []
        let conf = configs.global.RETHINK_DB //grabs the configurations for the RETHINKdb from configs/global.ts
        let tempConfig: r.ConnectOptions = { //configurations are ones defined in global.ts
            host: conf.host,
            port: conf.port,
            db: conf.db
        }
        let connect = (_config: r.ConnectOptions): void => {
            r.connect(_config, (err: Error, conn: r.Connection): void => {
                if (!err) {
                    _this.dbConn = conn //connects this instance of db to the ones in global.ts
                    _this.setAllEvents() //line 72
                } else {
                    console.log(err)
                }
            })
        }
        let connectWithCert = (_cert: any) => {
            let url = new URL(process.env[conf.env_url]) //sets the URL to whats defined in global.ts
            tempConfig = {
                host: url.hostname,
                port: parseInt(url.port),
                password: url.password,
                ssl: {
                    ca: _cert
                },
                db: conf.db
            }
            if (!_cert) delete tempConfig.ssl
            connect(tempConfig)
        }
        if (argv.remoteRDB && !argv.rawCert) {
            fs.readFile(process.env[conf.env_cert], (err, caCert) => {
                connectWithCert(caCert) //depending on arguements passed in, connects with caCert, cert from global.ts
            })
        } else if (argv.remoteRDB && argv.rawCert) {
            connectWithCert(process.env[conf.env_cert_raw])
        } else {
            connect(tempConfig)
        }

    }

    setAllEvents(): void {
        let _this = this
        r.table('blocks').changes().map((change) => { //creates a changefeed (infinite stream of objects representing changes to the query's results as they occur) of all documents in the table 'blocks' and maps that to the changed values
            return change('new_val') //change is a type which is an existing value changed in the result set - this returns the changed vals --> new val post all changes
        }).merge((block: any) => { //merge blocks together using the below subqueries to retrieve their transactions
            return {
                transactions: r.table('transactions').getAll(r.args(block('transactionHashes'))).coerceTo('array'), //turns stream of txns into array
                blockStats: {
                    pendingTxs: r.table('data').get('cached').getField('pendingTxs')
                }
            }
        }).run(_this.dbConn, (err, cursor) => { //runs the above query on a connection
            cursor.each((err: Error, block: blockLayout) => { //query ideally gets single JSON result of block
                if (!err) {
                    _this.vmRunner.setStateRoot(block.stateRoot)
                    let bstats = new BlockStats(block, block.transactions)
                    block.blockStats = Object.assign({}, bstats.getBlockStats(), block.blockStats)
                    let sBlock = new SmallBlock(block)
                    let blockHash = sBlock.hash()
                    _this.socketIO.to(blockHash).emit(blockHash + '_update', block) //emits event to all connected clients
                    _this.onNewBlock(sBlock.smallify()) //function written below that smallifies when there is a new block, onNewBlock also adds the block to redis
                    _this.onNewTx(block.transactions.map((_tx) => { //same as above, except for transactions
                        let sTx = new SmallTx(_tx)
                        let txHash: string = sTx.hash()
                        _this.socketIO.to(txHash).emit(txHash + '_update', _tx) //emits txn to all connected clients
                        return sTx.smallify()
                    }))
                }
            });
        });
        r.table('transactions').changes().filter(r.row('new_val')('pending').eq(true)).run(_this.dbConn, (err, cursor) => { //creates changefeed of txn & runs the query on a connection
            cursor.each((err, row: r.ChangeSet<any, any>) => {
                if (!err) {
                    let _tx: txLayout = row.new_val //if not a pending txn, move to next row
                    if (_tx.pending) {
                        let sTx = new SmallTx(_tx)
                        let txHash: string = sTx.hash()
                        _this.socketIO.to(txHash).emit(txHash + '_update', _tx) //socket emits tx to be the curr txn
                        _this.socketIO.to('pendingTxs').emit('newPendingTx', sTx.smallify()) //socket emits txn as latest pending
                    }
                }
            })
        })
    }

    getAddressTransactionPages(address: Buffer, hash: Buffer, bNumber: number, cb: (err: Error, result: any) => void): void {
        let _this = this
        let sendResults = (_cursor: any) => {
            _cursor.toArray((err: Error, results: Array<txLayout>) => {
                if (err) cb(err, null)
                else cb(null, results.map((_tx: txLayout) => {
                    return new SmallTx(_tx).smallify()
                }))
            });
        }
        if (!hash) {
            r.table("transactions").orderBy({ index: r.desc("numberAndHash") }).filter(
                r.row("from").eq(r.args([new Buffer(address)])).or(r.row("to").eq(r.args([new Buffer(address)])))
            ).limit(25).run(_this.dbConn, (err, cursor) => {
                if (err) cb(err, null)
                else sendResults(cursor)
            });
        } else {
            r.table("transactions").orderBy({ index: r.desc("numberAndHash") }).between(r.args([[r.minval, r.minval]]), r.args([[bNumber, new Buffer(hash)]]), { leftBound: "open", index: "numberAndHash" })
                .filter(
                    r.or(r.row("from").eq(r.args([new Buffer(address)])), r.row("to").eq(r.args([new Buffer(address)])))
                ).limit(25).run(_this.dbConn, function (err, cursor) {
                    if (err) cb(err, null)
                    else sendResults(cursor)
                });
        }
    }

    getTransactionPages(hash: Buffer, bNumber: number, cb: (err: Error, result: any) => void): void {
        let _this = this
        let sendResults = (_cursor: any) => {
            _cursor.toArray((err: Error, results: Array<txLayout>) => {
                if (err) cb(err, null)
                else cb(null, results.map((_tx: txLayout) => {
                    return new SmallTx(_tx).smallify()
                }))
            });
        }
        if (!hash) {
            r.table("transactions").orderBy({ index: r.desc("numberAndHash") }).filter({ pending: false }).limit(25).run(_this.dbConn, (err, cursor) => {
                if (err) cb(err, null)
                else sendResults(cursor)
            });
        } else {
            r.table("transactions").orderBy({ index: r.desc("numberAndHash") }).between(r.args([[r.minval, r.minval]]), r.args([[bNumber, new Buffer(hash)]]), { leftBound: "open", index: "numberAndHash" })
                .filter({ pending: false }).limit(25).run(_this.dbConn, function (err, cursor) {
                    if (err) cb(err, null)
                    else sendResults(cursor)
                });
        }
    }

    getBlockTransactions(hash: string, cb: (err: Error, result: any) => void): void {
        r.table('blocks').get(r.args([new Buffer(hash)])).do((block: any) => {
            return r.table('transactions').getAll(r.args(block('transactionHashes'))).coerceTo('array')
        }).run(this.dbConn, (err: Error, result: any) => {
            if (err) cb(err, null);
            else cb(null, result.map((_tx: txLayout) => {
                return new SmallTx(_tx).smallify()
            }));
        })
    }

    getTotalTxs(hash: string, cb: (err: Error, result: any) => void): void {
        var bhash = Buffer.from(hash.toLowerCase().replace('0x', ''), 'hex');
        r.table("transactions").getAll(r.args([bhash]), { index: "cofrom" }).count().run(this.dbConn, function (err: Error, count: any) {
            if (err) cb(err, null);
            else cb(null, count);
        })
    }

    getTxsOfAddress(hash: string, cb: (err: Error, result: any) => void): void {

        let _this = this
        let sendResults = (_cursor: any) => {
            _cursor.toArray((err: Error, results: Array<txLayout>) => {
                if (err) cb(err, null)
                else cb(null, results.map((_tx: txLayout) => {
                    return new SmallTx(_tx).smallify()
                }))
            });
        }
        var bhash = Buffer.from(hash.toLowerCase().replace('0x', ''), 'hex');
        r.table("transactions").getAll(r.args([bhash]), { index: "cofrom" }).limit(20).run(this.dbConn, function (err: Error, count: any) {
            if (err) cb(err, null);
            else sendResults(count)
        })
    }

    getChartsData(cb: (err: Error, result: any) => void): void {
        let _this = this
        let sendResults = (_cursor: any) => {
            _cursor.toArray((err: Error, results: Array<chartLayout>) => {
                if (err) cb(err, null)
                else cb(null, results)
            });
        }
        r.table('blockscache').between(r.epochTime(1465556900),
            r.epochTime(1465656900), { index: 'timestamp' }
        ).run(this.dbConn, function (err: Error, count: any) {
            if (err) cb(err, null);
            else sendResults(count)

        });

    }

    getBlock(hash: string, cb: (err: Error, result: any) => void): void {
        r.table('blocks').get(r.args([new Buffer(hash)])).run(this.dbConn, (err: Error, result: blockLayout) => {
            if (err) cb(err, null);
            else cb(null, result);
        })
    }

    getTx(hash: string, cb: (err: Error, result: any) => void): void {
        r.table("transactions").get(r.args([new Buffer(hash)])).merge(function (_tx) {
            return {
                trace: r.db("eth_mainnet").table('traces').get(_tx('hash')),
                logs: r.db("eth_mainnet").table('logs').get(_tx('hash'))
            }
        }).run(this.dbConn, (err: Error, result: txLayout) => {
            if (err) cb(err, null)
            else cb(null, result)
        })
    }

    onNewBlock(_block: blockLayout) {
        let _this = this
        console.log("go new block", _block.hash)
        this.socketIO.to('blocks').emit('newBlock', _block)
        ds.addBlock(_block)
    }
    onNewTx(_tx: txLayout | Array<txLayout>) {
        if (Array.isArray(_tx) && !_tx.length) return
        this.socketIO.to('txs').emit('newTx', _tx)
        ds.addTransaction(_tx)
    }
}

export default RethinkDB
