var _ = require('underscore');

var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();

var DDB_VIEWS_TABLE = 'podcast-views';

/**
 * PodcastView represents a pre-rendered view template.
 *
 * @param {Object} view - properties to set on the view and pass to the
 *                        template.
 * @constructor
 */
var PodcastView = module.exports = function PodcastView(view) {
  for (var property in view) {
    if (view.hasOwnProperty(property)) {
      this[property] = view[property];
    }
  }
};

/**
 * Find a view in DynamoDB by Id.
 *
 * @param {Object} id - The view id.
 * @param {Function} - Callback to call with an error or view.
 */
PodcastView.findById = function(id, callback) {
  var params = {
    TableName: DDB_VIEWS_TABLE,
    Key: id
  };

  dynamo.getItem(params, function(error, data) {
    if (error) {
      callback(error);
      return;
    }

    var view = new PodcastView(data.Item);
    callback(null, view);
  });
}

/**
 * Find all views for a given feed.
 *
 * @param {Object} feedId - The feed id.
 * @param {Function} - Callback with signature function(error, view, last)
 */
PodcastView.forEachView = function(feedId, callback) {
  forEachView(feedId, callback);
};

function forEachView(feedId, callback, startKey) {
  var params = {
    TableName: DDB_VIEWS_TABLE,
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

    data.Items.forEach(function(viewData, index, array) {
      var view = new PodcastView(viewData);
      var last = lastResponse && index == (array.length - 1);
      callback(null, view, last);
    });

    // If this is not the last set of responses, get more.
    if (!lastResponse) {
      forEachView(feedId, callback, data.LastEvaluatedKey);
    }
  });
}

PodcastView.prototype.render = function(episodes, callback) {
  var bucket = this.bucket;
  var filenameTemplate = this.filenameTemplate;
  var template = this.template;

  var data = {
    view: this,
    episodes: episodes,
  };  

  if (this.renderEach) {
    var remainingEpisodes = episodes.length;
    var uploadCallback = function(error) {
      remainingEpisodes--;
      if (remainingEpisodes == 0 || error != null) {
        callback(error);
      }
    };

    episodes.forEach(function(episode) {
      data['episode'] = episode;

      var filename = _.template(filenameTemplate)(data);
      var renderedView = _.template(template)(data);
      saveView(bucket, filename, renderedView, uploadCallback);  
    });
  } else {
    var filename = _.template(filenameTemplate)(data);
    var renderedView = _.template(template)(data);
    saveView(bucket, filename, renderedView, callback);
  }
};

function saveView(bucket, filename, renderedView, callback) {
  var params = {
    Bucket: bucket,
    Key: filename,
    Body: renderedView,
  };

  s3.putObject(params, callback);
}

PodcastView.prototype.remove = function(callback) {
  if (!this.bucket || !this.key) {
    callback(new Error("View is missing bucket or key"));
    return;
  }

  var params = {
    Bucket: this.bucket,
    Key: this.key
  };

  s3.deleteObject(params, callback);
}
