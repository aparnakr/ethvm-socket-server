/**
tableCache : local data structure that has an array of transactions, array of blocks
bufferify(obj:any) : Initializes a mapping from key : buffer if empty, otherwise converts a key : array mapping to a key : buffer mapping
getArray (tbName: any, cb: CallbackFunction) : gets the array after calling the callback function passed in on the parsed and buffered tbName
addTransaction (tx: txLayout | Array<txLayout>): adds either one or many transactions to the Itable cache and into the Redis database. If the
length of the data added is longer than what could be stored locally, it is added to redis and the max length is stored in the cache.
addBlock (block: blockLayout) : adds a block to the ItableCache and into the Redis database. If the length of the data added is longer than
what could be stored locally, it is added to redis and the max length is stored in the cache.
getBlocks (cb: CallbackFunction) : calls getArray on the cb function which gets blocks from cache or Redis
getTransactions (cb: CallbackFunction) : calls getArray on the cb function which gets txs from cache or Redis
intitialize () : initializes the transactions and blocks table in Redis
**/

import * as Redis from 'ioredis'
import configs from '@/configs'
import { txLayout, blockLayout } from '@/typeLayouts'
interface ItableCache  {
    transactions: Array<txLayout>;
    blocks: Array<blockLayout>;
}
let redis = new Redis(configs.global.REDIS.URL)
redis.on('error', function(error) {
  console.log("hello")
  console.dir(error)
})
let tableCache: ItableCache = {
    transactions: [],
    blocks: []
}
let tables = {
    transactions: "transactions",
    blocks: 'blocks'
}
type CallbackFunction = (data: Array<any>) => void;
let bufferify = (obj: any):any =>  {
    for (let key in obj) {
      // checks if key is a field/ function in obj
        if (obj.hasOwnProperty(key) && obj[key]) {
            if (obj[key].type && obj[key].type === 'Buffer') {
                obj[key] = new Buffer(obj[key])
            } else if(Array.isArray(obj[key])){
                obj[key] = obj[key].map((_item: any)=>{
                    if(_item.type && _item.type === 'Buffer') return new Buffer(_item)
                    else return _item
                })
            }
        }
    }
    return obj
}

let getArray = (tbName: any, cb: CallbackFunction) => {
    let tbKey: (keyof ItableCache) = tbName;
    if (tableCache[tbKey].length) cb(tableCache[tbKey])
    else {
        let vals = redis.get(tbName, (err, result) => {
            if (!err && result) {
                let bufferedArr = JSON.parse(result).map((_item: any) => {
                    return bufferify(_item)
                })
                tableCache[tbKey] = bufferedArr
                cb(bufferedArr)
            }
            else cb([])
        })
    }

}

let addTransaction = (tx: txLayout | Array<txLayout>): void => {
    getArray(tables.transactions, (pTxs) => {
        if (Array.isArray(tx)) {
            tx.forEach((tTx) => {
              // if pTxs = [1, 2] and tTx = [3, 4] this changes pTxs = [4, 3, 1, 2]
                pTxs.unshift(tTx)
            })
        } else {
          // adds to front of array
            pTxs.unshift(tx)
        }
        if (pTxs.length > configs.global.MAX.socketRows) pTxs = pTxs.slice(0, configs.global.MAX.socketRows)
        let tbKey: (keyof ItableCache) = "transactions"
        tableCache[tbKey] = pTxs
        redis.set(tables.transactions, JSON.stringify(pTxs))
    })
}
let addBlock = (block: blockLayout) => {
    getArray(tables.blocks, (pBlocks) => {
        pBlocks.unshift(block)
        if (pBlocks.length > configs.global.MAX.socketRows) pBlocks = pBlocks.slice(0, configs.global.MAX.socketRows)
        let tbKey: (keyof ItableCache) = "blocks"
        tableCache[tbKey] = pBlocks
        redis.set(tables.blocks, JSON.stringify(pBlocks))
    })
}

let getBlocks = (cb: CallbackFunction) => {
    getArray(tables.blocks, cb)
}
let getTransactions = (cb: CallbackFunction) => {
    getArray(tables.transactions, cb)
}

let thisReturnsANumber = (id: number, name: string): number => {
    return 0
}
let initialize = ():void => {
    redis.set(tables.transactions, JSON.stringify([]))
    redis.set(tables.blocks, JSON.stringify([]))
}

export default {
    addTransaction,
    addBlock,
    getBlocks,
    getTransactions,
    initialize
}
