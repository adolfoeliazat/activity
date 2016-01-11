/*
 * Copyright (c) 2015
 *
 * This file is licensed under the Affero General Public License version 3
 * or later.
 *
 * See the COPYING-README file.
 *
 */
$(function(){
	OCA.Activity = OCA.Activity || {};

	OCA.Activity.Filter = {
		filter: undefined,
		$navigation: $('#app-navigation'),


		_onPopState: function(params) {
			params = _.extend({
				filter: 'all'
			}, params);

			this.setFilter(params.filter);
		},

		setFilter: function (filter) {
			if (filter === this.filter) {
				return;
			}

			this.$navigation.find('a[data-navigation=' + this.filter + ']').parent().removeClass('active');
			OCA.Activity.InfinitScrolling.firstKnownId = 0;
			OCA.Activity.InfinitScrolling.lastGivenId = 0;

			this.filter = filter;

			OCA.Activity.InfinitScrolling.$container.animate({ scrollTop: 0 }, 'slow');
			OCA.Activity.InfinitScrolling.$container.children().remove();
			$('#emptycontent').addClass('hidden');
			$('#no_more_activities').addClass('hidden');
			$('#loading_activities').removeClass('hidden');
			OCA.Activity.InfinitScrolling.ignoreScroll = 0;

			this.$navigation.find('a[data-navigation=' + filter + ']').parent().addClass('active');

			OCA.Activity.InfinitScrolling.prefill();
		}
	};

	OCA.Activity.InfinitScrolling = {
		ignoreScroll: 0,
		$container: $('#container'),
		lastDateGroup: null,
		$content: $('#app-content'),
		firstKnownId: 0,
		lastGivenId: 0,

		prefill: function () {
			this.ignoreScroll += 1;
			if (this.$content.scrollTop() + this.$content.height() > this.$container.height() - 100) {
				this.ignoreScroll += 1;
				this.loadMoreActivities();
			}
			this.ignoreScroll -= 1;
		},

		onScroll: function () {
			if (this.ignoreScroll <= 0 && this.$content.scrollTop() +
				this.$content.height() > this.$container.height() - 100) {
				this.ignoreScroll = 1;
				this.loadMoreActivities();
			}
		},

		/**
		 * Request a new bunch of activities from the server
		 */
		loadMoreActivities: function () {
			var self = this;

			$.ajax({
				url: OC.linkToOCS('apps/activity/api/v2/activity', 2) + OCA.Activity.Filter.filter + '?format=json&previews=true&since=' + self.lastGivenId,
				type: 'GET',
				beforeSend: function(xhr) {
					xhr.setRequestHeader("Accept-Language", OC.getLocale());
				},
				success: function(response, status, xhr) {
					if (status === 'notmodified') {
						self.handleActivitiesCallback([]);
						self.saveHeaders(xhr.getAllResponseHeaders());
						return;
					}

					self.saveHeaders(xhr.getAllResponseHeaders());
					if (typeof response != 'undefined') {
						self.handleActivitiesCallback(response.ocs.data);
						self.ignoreScroll -= 1;
					}
				}
			});
		},

		/**
		 * Read the X-Activity-First-Known and X-Activity-Last-Given headers
		 * @param headers
		 */
		saveHeaders: function(headers) {
			var self = this;

			headers = headers.split("\n");
			_.each(headers, function (header) {
				[head, value] = header.split(': ');
				if (head === 'X-Activity-First-Known') {
					self.firstKnownId = parseInt(value, 10);
				} else if (head === 'X-Activity-Last-Given') {
					self.lastGivenId = parseInt(value, 10);
				}
			});
		},

		/**
		 * Append activities to the view or display end/no content
		 * @param data
		 */
		handleActivitiesCallback: function (data) {
			var numActivities = data.length;

			if (numActivities > 0) {
				for (var i = 0; i < data.length; i++) {
					var activity = data[i];
					this.appendActivityToContainer(activity);
				}

				// Continue prefill
				this.prefill();

			} else if (this.$container.children().length === 0) {
				// First page is empty - No activities :(
				var $emptyContent = $('#emptycontent');
				$emptyContent.removeClass('hidden');
				if (OCA.Activity.Filter.filter == 'all') {
					$emptyContent.find('p').text(t('activity', 'This stream will show events like additions, changes & shares'));
				} else {
					$emptyContent.find('p').text(t('activity', 'There are no events for this filter'));
				}
				$('#loading_activities').addClass('hidden');
				this.ignoreScroll = 1;

			} else {
				// Page is empty - No more activities :(
				$('#no_more_activities').removeClass('hidden');
				$('#loading_activities').addClass('hidden');
				this.ignoreScroll = 1;
			}
		},

		appendActivityToContainer: function (activity) {
			activity.timestamp = moment(activity.datetime).valueOf();
			this.makeSureDateGroupExists(activity.timestamp);
			this.addActivity(activity);
		},

		makeSureDateGroupExists: function(timestamp) {
			var dayOfYear = OC.Util.formatDate(timestamp, 'YYYY-DDD');
			var $lastGroup = this.$container.children().last();

			if ($lastGroup.data('date') !== dayOfYear) {
				var dateOfDay = OC.Util.formatDate(timestamp, 'LL'),
					displayDate = dateOfDay;

				var today = OC.Util.formatDate(moment(), 'YYYY-DDD');
				if (dayOfYear === today) {
					displayDate = t('activity', 'Today');
				} else {
					var yesterday = OC.Util.formatDate(moment().subtract(1, 'd'), 'YYYY-DDD');

					if (dayOfYear === yesterday) {
						displayDate = t('activity', 'Yesterday');
					}
				}

				var content = '<div class="section activity-section group" data-date="' + escapeHTML(dayOfYear) + '">' + "\n"
					+'	<h2>'+"\n"
					+'		<span class="has-tooltip" title="' + escapeHTML(dateOfDay) + '">' + escapeHTML(displayDate) + '</span>' + "\n"
					+'	</h2>' + "\n"
					+'	<div class="boxcontainer">' + "\n"
					+'	</div>' + "\n"
					+'</div>';
				var $content = $(content);
				this.processElements($content);
				this.$container.append($content);
				this.lastDateGroup = $content;
			}
		},

		addActivity: function(activity) {
			var parsedSubject = this.parseMessage(activity.subject_prepared);

			if (parsedSubject.indexOf('<a') >= 0) {
				activity.link = '';
			}

			var content = ''
				+ '<div class="box">' + "\n"
				+ '	<div class="messagecontainer">' + "\n"

				+ '		<div class="activity-icon ' + ((activity.typeicon) ? escapeHTML(activity.typeicon) + ' svg' : '') + '"></div>' + "\n"

				+ '		<div class="activitysubject">' + "\n"
				+ ((activity.link) ? '			<a href="' + activity.link + '">' + "\n" : '')
				+ '			' + parsedSubject + "\n"
				+ ((activity.link) ? '			</a>' + "\n" : '')
				+ '		</div>' + "\n"

				+'		<span class="activitytime has-tooltip" title="' + escapeHTML(OC.Util.formatDate(activity.timestamp)) + '">' + "\n"
				+ '			' + escapeHTML(OC.Util.relativeModifiedDate(activity.timestamp)) + "\n"
				+'		</span>' + "\n";

			if (activity.message_prepared) {
				content += '<div class="activitymessage">' + "\n"
					+ this.parseMessage(activity.message_prepared) + "\n"
					+'</div>' + "\n";
			}

			if (activity.previews && activity.previews.length) {
				content += '<br />';
				for (var i = 0; i < activity.previews.length; i++) {
					var preview = activity.previews[i];
					content += ((preview.link) ? '<a href="' + preview.link + '">' + "\n" : '')
						+ '<img class="preview' + ((preview.isMimeTypeIcon) ? ' preview-mimetype-icon' : '') + '" src="' + preview.source + '" alt=""/>' + "\n"
						+ ((preview.link) ? '</a>' + "\n" : '')
				}
			}

			content += '	</div>' + "\n"
				+'</div>';

			var $content = $(content);
			this.processElements($content);
			this.lastDateGroup.append($content);
		},

		/**
		 * Parses a message
		 *
		 * @param {String} message
		 * @returns {String}
		 */
		parseMessage: function (message) {
			var parsedMessage = this.parseCollection(message);
			parsedMessage = this.parseParameters(parsedMessage, true);
			return parsedMessage;
		},

		/**
		 * Parses a collection tag
		 *
		 * @param {String} message
		 * @returns {String}
		 */
		parseCollection: function(message) {
			var self = this;

			return message.replace(/<collection>(.*?)<\/collection>/g, function (match, parameterString, a, b, c, d, e, f) {
				var parameterList = parameterString.split('><'),
					parameterListLength = parameterList.length,
					parameters = [];

				for (var i = 0; i < parameterListLength; i++) {
					var parameter = parameterList[i];
					if (i > 0) {
						parameter = '<' + parameter;
					}
					if (i + 1 < parameterListLength) {
						parameter = parameter + '>';
					}

					if (parameterListLength > 5 && i > 2) {
						parameters.push(self.parseParameters(parameter, false));
					} else {
						parameters.push(self.parseParameters(parameter, true));
					}
				}

				if (parameters.length === 1) {
					return parameters.pop();
				} else if (parameters.length <= 5) {
					var lastParameter = parameters.pop();
					return t('activity', '{parameterList} and {lastParameter}', {
						parameterList: parameters.join(t('activity', ', ')),
						lastParameter: lastParameter
					}, undefined, {
						escape: false
					});
				} else {
					var firstParameters = parameters.slice(0, 3).join(t('activity', ', ')),
						otherParameters = parameters.slice(3).join(t('activity', ', ')),
						listLength = parameters.length;

					return n('activity',
						'{parameterList} and {linkStart}%n more{linkEnd}',
						'{parameterList} and {linkStart}%n more{linkEnd}',
						listLength - 3,
						{
							parameterList: firstParameters,
							linkStart: '<strong class="has-tooltip" title="' + otherParameters + '">',
							linkEnd: '</strong>'
						},
						{
							escape: false
						}
					);
				}
			});
		},

		/**
		 * Parses parameters
		 *
		 * @param {String} message
		 * @param {boolean} useHtml
		 * @returns {String}
		 */
		parseParameters: function (message, useHtml) {
			message = this.parseUntypedParameters(message, useHtml);
			message = this.parseUserParameters(message, useHtml);
			message = this.parseFederatedCloudIDParameters(message, useHtml);
			message = this.parseFileParameters(message, useHtml);

			return message;
		},

		/**
		 * Parses a parameter tag
		 *
		 * @param {String} message
		 * @param {boolean} useHtml
		 * @returns {String}
		 */
		parseUntypedParameters: function(message, useHtml) {
			return message.replace(/<parameter>(.*?)<\/parameter>/g, function (match, parameter) {
				if (useHtml) {
					return '<strong>' + parameter + '</strong>';
				} else {
					return parameter;
				}
			});
		},

		/**
		 * Parses a user tag
		 *
		 * @param {String} message
		 * @param {boolean} useHtml
		 * @returns {String}
		 */
		parseUserParameters: function(message, useHtml) {
			var self = this;

			return message.replace(/<user\ display\-name=\"(.*?)\">(.*?)<\/user>/g, function (match, displayName, userId) {
				if (useHtml) {
					var userString = '<strong>' + displayName +  '</strong>';
					if (self.$container.data('avatars-enabled') === 'yes') {
						userString = '<div class="avatar" data-user="' + userId + '" data-user-display-name="' + displayName + '"></div>' + userString;
					}

					return userString;
				} else {
					return displayName;
				}
			});
		},

		/**
		 * Parses a federated cloud id tag
		 *
		 * @param {String} message
		 * @param {boolean} useHtml
		 * @returns {String}
		 */
		parseFederatedCloudIDParameters: function(message, useHtml) {
			return message.replace(/<federated-cloud-id\ display\-name=\"(.*?)\"\ user=\"(.*?)\"\ server=\"(.*?)\">(.*?)<\/federated-cloud-id>/g, function (match, displayName, userId, server, cloudId) {
				if (displayName === cloudId) {
					// No display name from contacts, use a short version of the id in the UI
					displayName = userId + '@…';
				}

				if (useHtml) {
					return '<strong class="has-tooltip" title="' + cloudId + '">' + displayName + '</strong>';
				} else {
					return displayName;
				}
			});
		},

		/**
		 * Parses a file tag
		 *
		 * @param {String} message
		 * @param {boolean} useHtml
		 * @returns {String}
		 */
		parseFileParameters: function(message, useHtml) {
			return message.replace(/<file\ link=\"(.*?)\"\ id=\"(.*?)\">(.*?)<\/file>/g, function (match, link, fileId, path) {
				var title = '',
					displayPath = path,
					lastSlashPosition = path.lastIndexOf('/');


				if (lastSlashPosition > 0) {
					var dirPath = path.substring(0, lastSlashPosition);
					displayPath = path.substring(lastSlashPosition + 1);

					// No display name from contacts, use a short version of the id in the UI
					title = '" title="' + escapeHTML(t('activity', 'in {directory}', {
						directory: dirPath
					}));
				}

				if (useHtml) {
					return '<a class="filename has-tooltip" href="' + link + title + '">' + displayPath + '</a>';
				} else {
					return path;
				}
			});
		},

		processElements: function ($element) {
			$element.find('.avatar').each(function() {
				var element = $(this);
				if (element.data('user-display-name')) {
					element.avatar(element.data('user'), 28, undefined, false, undefined, element.data('user-display-name'));
				} else {
					element.avatar(element.data('user'), 28);
				}
			});

			$element.find('.has-tooltip').tooltip({
				placement: 'bottom'
			})
		}
	};

	OC.Util.History.addOnPopStateHandler(_.bind(OCA.Activity.Filter._onPopState, OCA.Activity.Filter));
	OCA.Activity.Filter.setFilter(OCA.Activity.InfinitScrolling.$container.attr('data-activity-filter'));
	OCA.Activity.InfinitScrolling.$content.on('scroll', _.bind(OCA.Activity.InfinitScrolling.onScroll, OCA.Activity.InfinitScrolling));

	OCA.Activity.Filter.$navigation.find('a[data-navigation]').on('click', function (event) {
		var filter = $(this).attr('data-navigation');
		if (filter !== OCA.Activity.Filter.filter) {
			OC.Util.History.pushState({
				filter: filter
			});
		}
		OCA.Activity.Filter.setFilter(filter);
		event.preventDefault();
	});

	$('#enable_rss').change(function () {
		if (this.checked) {
			$('#rssurl').removeClass('hidden');
		} else {
			$('#rssurl').addClass('hidden');
		}
		$.post(OC.generateUrl('/apps/activity/settings/feed'), 'enable=' + this.checked, function(response) {
			$('#rssurl').val(response.data.rsslink);
		});
	});

	$('#rssurl').on('click', function () {
		$('#rssurl').select();
	});
});

