module.exports.commands = {
  diff: require('./commands/diff'),
  release: require('./commands/release'),
  food: require('./commands/food'),
  pipeline: require('./commands/pipeline'),
  // demo: require('./commands/demo'), // TODO: needs work on the view handler
  // TODO: and migrate other ones from modules/need-revision
}
