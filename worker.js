const diff = require('./modules/diff')
const food = require('./modules/food')
const pipeline = require('./modules/pipeline')
const avail = require('./modules/availability')
const vacay = require('./modules/vacation')

// const modules = require('./modules')

// module.exports = {
//   ...Object.entries(modules).reduce((agg, [uri, { worker }]) => {
//     agg[uri] = async (event) => {
//       await worker(event)
//       return { statusCode: 200 }
//     }
//   }, {})
// }

module.exports.diff = async (event) => {
  await diff.worker(event)
  return { statusCode: 200 }
}

module.exports.food = async (event) => {
  await food.worker(event)
  return { statusCode: 200 }
}

module.exports.pipeline = async (event) => {
  await pipeline.worker(event)
  return { statusCode: 200 }
}

module.exports.avail = async (event) => {
  await avail.worker(event)
  return { statusCode: 200 }
}

module.exports.vacay = async (event) => {
  await vacay.worker(event)
  return { statusCode: 200 }
}
