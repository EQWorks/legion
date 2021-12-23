const { routes } = require('./modules')

// `type` is the name of the export key in ./modules/index
module.exports.handler = async ({ type, payload }) => {
  console.dir(routes)
  const { worker } = routes[type]
  await worker(payload)
  return { statusCode: 200 }
}
