const { commands } = require('./modules')

// `type` is the name of the export key in ./modules/index
module.exports.handler = async ({ type, payload }) => {
  const { worker } = commands[type]
  if (worker) {
    await worker(payload)
  }
  return { statusCode: 200 }
}
