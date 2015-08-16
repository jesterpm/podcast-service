var AWS = require('aws-sdk');
AWS.config.update({region: "us-west-2"});

var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();

var PodcastView = require('./PodcastView');
var PodcastEpisode = require('./PodcastEpisode');

exports.handleViewUpdate = function(event, context) {
  // Handle dynamo event for the views table.

  // Each modified view is added as a key in this Object to dedupe multiple
  // updates for the same key.
  var viewsToUpdate = {};

  event.Records.forEach(function(record) {
    var eventName = record.eventName;
    var viewKey = record.dynamodb.Keys;

    switch (eventName) {
      case 'INSERT':
      case 'MODIFY':
        viewsToUpdate[viewKey] = 'update';
        break;
      case 'REMOVE':
        viewsToUpdate[viewKey] = 'remove';
        break;
      default:
        context.fail(new Error('Unrecognized eventName "' + eventname + '"'));
    }
  });

  var viewIds = Object.keys(viewsToUpdate);

  var remainingCount = 0;
  var errors = [];
  var callback = function(error, data) {
    // When all are done, call context callback.
    remainingCount--;
    if (error != null) {
      errors.push(error);
    }

    if (remainingCount == 0) {
      if (errors.length == 0) {
        context.succeed();
      } else {
        context.fail(new Error("Failures updating views"), errors);
      }
    }
  };

  // Start each update/remove operation.
  viewIds.forEach(function(viewId) {
    var operation = viewsToUpdate[viewId];
    PodcastView.findById(viewId, function(error, view) {
      if (operation == 'update') {
        remainingCount++;
        view.render(callback);
      } else if (operation == 'remove') {
        remainingCount++;
        view.remove(callback);
      }
    });
  });
};

exports.handleEpisodeUpdate = function(event, context) {
  // Handle dynamo event for the episodes table.

  // Each modified feed is added as a key in this Object to dedupe multiple
  // updates for the same feed.
  var feedsToUpdate = {};

  event.Records.forEach(function(record) {
    var eventName = record.eventName;

    switch (eventName) {
      case 'INSERT':
        feedsToUpdate[record.dynamodb.NewImage.feedId] = true;
        break;
      case 'MODIFY':
        var oldImageFeed = record.dynamodb.OldImage.feedId;
        var newImageFeed = record.dynamodb.NewImage.feedId;
        if (oldImageFeed != newImageFeed) {
          feedsToUpdate[oldImageFeed] = true;
        }
        feedsToUpdate[newImageFeed] = true;
        break;
      case 'REMOVE':
        feedsToUpdate[record.dynamodb.OldImage.feedId] = true;
        break;
      default:
        context.fail(new Error('Unrecognized eventName "' + eventname + '"'));
    }
  });

  var feedIds = Object.keys(feedsToUpdate);

  var remainingCount = 0;
  var errors = [];
  var callback = function(error, data) {
    // When all are done, call context callback.
    remainingCount--;
    if (error != null) {
      errors.push(error);
    }

    if (remainingCount == 0) {
      if (errors.length == 0) {
        context.succeed();
      } else {
        context.fail(new Error("Failures updating feeds"), errors);
      }
    }
  };

  // Start updates for each feed.
  feedIds.forEach(function(feedId) {
    remainingCount++;
    renderViewsForFeed(feedId, callback);
  });
};

function renderViewsForFeed(feedId, callback) {
  PodcastEpisode.getEpisodesForFeed(feedId, function(error, episodes) {
    if (error) {
      callback(error);
      return;
    }
    console.log("Got episodes " + JSON.stringify(episodes));

    var remainingCount = 0;
    var errors = [];
    var renderCallback = function(error, data) {
      // When all are done, call context callback.
      remainingCount--;
      console.log("Remaining is " + remainingCount);
      if (error != null) {
        errors.push(error);
      }

      if (remainingCount == 0) {
        if (errors.length == 0) {
          callback();
        } else {
          callback(new Error("Failures rendering feeds"), errors);
        }
      }
    };

    // Get all of the views for the feed.
    PodcastView.forEachView(feedId, function(error, view, last) {
      remainingCount++;
      if (error != null) {
        renderCallback(error);
      } else {
        view.render(episodes, renderCallback);
      }
    });
  });
}
