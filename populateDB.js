var Web3 = require("web3");
var HttpHeaderProvider = require("httpheaderprovider");
var port = "ws://127.0.0.1:8545";

//websocket setup
var infura_ws = "wss://rinkeby.infura.io/_ws";
var provider_ws = new Web3.providers.WebsocketProvider(infura_ws)
var web3 = new Web3(provider_ws);

//rpc setup
var web3rpc = new Web3(new Web3.providers.HttpProvider("https://rinkeby.infura.io/V3sPPraTfVr8lKVhYfwj"));


var r = require('rethinkdb');
var DB_NAME = "thunder_testnet";
var DB_TABLES = ["blocks", "blockscache", "transactions", "traces", "logs", "data"];

//Websocket reconnection
provider_ws.on('error', e => console.log('WS Error', e));
provider_ws.on('end', e => {
    console.log('WS closed');
    console.log('Attempting to reconnect...');
    provider_ws = new Web3.providers.WebsocketProvider(infura_ws);

    provider_ws.on('connect', function () {
        console.log('WSS Reconnected');
    });

    web3.setProvider(provider_ws);
});

//print transactions
function printTransaction(txHash) {
  var tx = eth.getTransaction(txHash);
  if (tx != null) {
    console.log("  tx hash          : " + tx.hash + "\n"
      + "   nonce           : " + tx.nonce + "\n"
      + "   blockHash       : " + tx.blockHash + "\n"
      + "   blockNumber     : " + tx.blockNumber + "\n"
      + "   transactionIndex: " + tx.transactionIndex + "\n"
      + "   from            : " + tx.from + "\n"
      + "   to              : " + tx.to + "\n"
      + "   value           : " + tx.value + "\n"
      + "   gasPrice        : " + tx.gasPrice + "\n"
      + "   gas             : " + tx.gas + "\n"
      + "   input           : " + tx.input);
  }
}

//print blocks
function printBlock(block) {
  console.log("Block number     : " + block.number + "\n"
    + " hash            : " + block.hash + "\n"
    + " parentHash      : " + block.parentHash + "\n"
    + " nonce           : " + block.nonce + "\n"
    + " sha3Uncles      : " + block.sha3Uncles + "\n"
    + " logsBloom       : " + block.logsBloom + "\n"
    + " transactionsRoot: " + block.transactionsRoot + "\n"
    + " stateRoot       : " + block.stateRoot + "\n"
    + " miner           : " + block.miner + "\n"
    + " difficulty      : " + block.difficulty + "\n"
    + " totalDifficulty : " + block.totalDifficulty + "\n"
    + " extraData       : " + block.extraData + "\n"
    + " size            : " + block.size + "\n"
    + " gasLimit        : " + block.gasLimit + "\n"
    + " gasUsed         : " + block.gasUsed + "\n"
    + " timestamp       : " + block.timestamp + "\n"
    + " transactions    : " + block.transactions + "\n"
    + " uncles          : " + block.uncles);
    if (block.transactions != null) {
      console.log("--- transactions ---");
      block.transactions.forEach( function(e) {
        printTransaction(e);
      })
    }
}

//subscribe to geth pub sub
var subscription = web3.eth.subscribe("newBlockHeaders", function(error, result){
  if(error)
    console.log(error);
}).on("data", function(blockHeader){ //listen for notifications
  //rpc calls on notification
  console.log("heard new Header", blockHeader);
  var blockNumber = blockHeader.number;
  //var blockNumber = web3rpc.eth.blockNumber;
  console.log(blockNumber);
  web3.setProvider(new Web3.providers.HttpProvider("https://rinkeby.infura.io/V3sPPraTfVr8lKVhYfwj"))
  var block = web3.eth.getBlock(blockNumber);
  printBlock(block);
  web3.setProvider(provider_ws)
});


/* connects the rethinkDB to the node. This is also where initialization
  of the different tables happen.

function connect(){
// TODO later: 1. check if remote node
// TODO later: 2. check if certificate exists
// if none of the above, just connect
r.connect({db: 'DB_NAME'}, function(err, conn){ if err console.log(err)});

}
*/
