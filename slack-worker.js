const modules = require('./modules')

module.exports = async ({ type, payload }) => {
  const worker = modules(type)
  await worker(payload)
  return { statusCode: 200 }
}
