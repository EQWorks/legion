const modules = require('./modules')

// `type`` is the name of the export key in ./modules/index
module.exports.handler = async ({ type, payload }) => {
  const { worker } = modules[type]
  await worker(payload)
  return { statusCode: 200 }
}
