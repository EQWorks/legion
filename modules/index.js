const release = require('./need-revision/release')


module.exports.routes = {
  release,
}

module.exports.commands = {
  diff: require('./commands/diff'),
  food: require('./commands/food'),
  pipeline: require('./commands/pipeline'),
  // demo: require('./commands/demo'), // TODO: needs work on the view handler
}
