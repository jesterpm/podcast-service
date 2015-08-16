var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();

var DDB_EPISODES_TABLE = 'podcast-episodes';

/**
 * PodcastEpisode represents a single podcast episode.
 *
 * @param {Object} episode - properties to set on the episode.
 * @constructor
 */
var PodcastEpisode = module.exports = function PodcastEpisode(episode) {
  for (var property in episode) {
    if (episode.hasOwnProperty(property)) {
      this[property] = episode[property];
    }
  }
};

/**
 * Find an episode in DynamoDB by Id.
 *
 * @param {Object} id - The episode id.
 * @param {Function} - Callback to call with an error or episode.
 */
PodcastEpisode.findById = function(id, callback) {
  var params = {
    TableName: DDB_EPISODES_TABLE,
    Key: id
  };

  dynamo.getItem(params, function(error, data) {
    if (error) {
      callback(error);
      return;
    }

    var episode = new PodcastEpisode(data.Item);
    callback(null, episode);
  });
}

/**
 * Find all episodes for a given feed.
 *
 * @param {Object} feedId - The feed id.
 * @param {Function} - Callback with signature function(error, episode, last)
 */
PodcastEpisode.forEachEpisode = function(feedId, callback) {
  forEachEpisode(feedId, callback);
};

function forEachEpisode(feedId, callback, startKey) {
  var params = {
    TableName: DDB_EPISODES_TABLE,
    KeyConditionExpression: "feedId = :feedId",
    ExpressionAttributeValues: {
      ':feedId': feedId
    }
  };

  if (startKey) {
    params['ExclusiveStartKey'] = startKey;
  }

  dynamo.query(params, function(error, data) {
    if (error != null) {
      callback(error);
      return;
    }

    var lastResponse = !data.LastEvaluatedKey;

    data.Items.forEach(function(episodeData, index, array) {
      var episode = new PodcastEpisode(episodeData);
      var last = lastResponse && index == (array.length - 1);
      callback(null, episode, last);
    });

    // If this is not the last set of responses, get more.
    if (!lastResponse) {
      forEachEpisode(feedId, callback, data.LastEvaluatedKey);
    }
  });
}

/**
 * Find all episodes for a given feed and return them as a collection.
 *
 * @param {Object} feedId - The feed id.
 * @param {Function} - Callback with signature function(error, episodes)
 */
PodcastEpisode.getEpisodesForFeed = function(feedId, callback) {
  var episodes = [];
  PodcastEpisode.forEachEpisode(feedId, function(error, episode, last) {
    if (error) {
      callback(error);
      return;
    }

    episodes.append(episode);

    if (last) {
      callbacK(null, episodes);
    }
  });
};
