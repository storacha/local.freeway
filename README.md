# local.freeway

Run freeway locally!

## Usage

Install Node.js v20.11+ from [nodejs.org](https://nodejs.org).

Clone repo and install dependencies:

```sh
git clone https://github.com/w3s-project/local.freeway.git
cd local.storage
npm install
```

Copy `.env.template` to `.env` and set environment variables:

```sh
### required

CONTENT_CLAIMS_SERVICE_URL=http://localhost:3000/claims

### optional

PORT=9000
```

Start the service:

```sh
npm start
```

## Contributing

All welcome! web3.storage is open-source.

## License

Dual-licensed under [MIT + Apache 2.0](LICENSE.md)
