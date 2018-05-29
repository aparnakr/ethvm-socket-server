# ethvm-socket-server
Socket server which handles the backend for ethvm




### Prerequisites

rethinkdb and redis server

set environment variables

#!/usr/bin/env bash
export RETHINKDB_URL="rethinkdb://localhost:28015"
export REDIS_URL="127.0.0.1:6379"
export RPC_HOST="localhost"
export RPC_PORT="8545"

### Installation instructions

```sh
$ git clone https://github.com/enKryptIO/ethvm-socket-server
$ npm install  
$ npm run compose
```
