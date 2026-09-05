/*
 * holaself TV-shows integration.
 * Uses Lampa's native Main/Season/Episode/Torrents components and Router.
 * No custom full-screen UI is created here.
 */
(function (window) {
    'use strict';

    var CONFIG_URL = 'tv-shows.json';
    var TVMAZE_URL = 'https://api.tvmaze.com/';
    var configPromise = null;
    var menuAdded = false;

    function getConfig() {
        if (!configPromise) {
            configPromise = fetch(CONFIG_URL + '?v=' + Date.now(), { credentials: 'omit' })
                .then(function (response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json();
                });
        }
        return configPromise;
    }

    function apiGet(url) {
        return fetch(url, { credentials: 'omit' }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        });
    }

    function pad2(value) {
        value = String(value);
        return value.length < 2 ? '0' + value : value;
    }

    function torrentQuery(showName, season, episode) {
        return showName + ' S' + pad2(season) + 'E' + pad2(episode);
    }

    function resolveShow(show) {
        if (show.id) return apiGet(TVMAZE_URL + 'shows/' + encodeURIComponent(show.id));

        return apiGet(TVMAZE_URL + 'search/shows?q=' + encodeURIComponent(show.name)).then(function (items) {
            if (!items || !items.length) throw new Error('TV show not found: ' + show.name);

            var exact = items.filter(function (item) {
                return item.show && String(item.show.name).toLowerCase() === String(show.name).toLowerCase();
            });

            return (exact[0] || items[0]).show;
        });
    }

    function makeMain(object) {
        return Lampa.Maker.make('Main', object);
    }

    function channelsComponent(object) {
        var results = (object.channels || [])
            .filter(function (channel) { return channel.enabled !== false; })
            .map(function (channel) {
                return {
                    title: channel.name,
                    name: channel.name,
                    original_name: channel.name,
                    source: 'tvmaze',
                    params: {
                        emit: {
                            onlyEnter: function () {
                                Lampa.Router.call('holaself_tv_shows', { channel: channel });
                            }
                        }
                    }
                };
            });

        return makeMain({
            title: 'ТВ-шоу',
            results: [{
                title: 'Телеканалы',
                results: results
            }]
        });
    }

    function showsComponent(object) {
        var channel = object.channel || { name: 'ТВ-шоу', shows: [] };
        var results = (channel.shows || []).map(function (show) {
            return {
                title: show.name,
                name: show.name,
                original_name: show.name,
                source: 'tvmaze',
                params: {
                    emit: {
                        onlyEnter: function () {
                            Lampa.Router.call('holaself_tv_seasons', { show: show });
                        }
                    }
                }
            };
        });

        return makeMain({
            title: channel.name,
            results: [{
                title: channel.name,
                results: results
            }]
        });
    }

    function seasonsComponent(object) {
        var component = Lampa.Maker.make('Main', {
            title: object.show && object.show.name,
            results: []
        });

        component.use({
            onCreate: function () {
                var activity = this.activity;
                if (activity) activity.loader(true);

                resolveShow(object.show).then(function (details) {
                    return apiGet(TVMAZE_URL + 'shows/' + encodeURIComponent(details.id) + '/episodes').then(function (episodes) {
                        return { details: details, episodes: episodes };
                    });
                }).then(function (data) {
                    var details = data.details;
                    var episodes = data.episodes || [];
                    var seasons = {};
                    var movie = {
                        id: details.id,
                        name: details.name || object.show.name,
                        title: details.name || object.show.name,
                        original_name: details.name || object.show.name,
                        original_title: details.name || object.show.name,
                        first_air_date: details.premiered || '',
                        genres: (details.genres || []).map(function (name) { return { name: name }; }),
                        is_serial: true,
                        number_of_seasons: 1,
                        source: 'tvmaze'
                    };

                    episodes.forEach(function (episode) {
                        var season = Number(episode.season || 1);
                        if (!seasons[season]) seasons[season] = [];
                        episode.original_name = movie.original_name;
                        episode.card = movie;
                        episode.showName = object.show.name;
                        seasons[season].push(episode);
                    });

                    var seasonResults = Object.keys(seasons).sort(function (a, b) {
                        return Number(b) - Number(a);
                    }).map(function (seasonNumber) {
                        var seasonEpisodes = seasons[seasonNumber];
                        return {
                            season_number: Number(seasonNumber),
                            season: Number(seasonNumber),
                            name: 'Сезон ' + seasonNumber,
                            title: 'Сезон ' + seasonNumber,
                            episode_count: seasonEpisodes.length,
                            episodes: seasonEpisodes,
                            card: movie,
                            params: {
                                createInstance: function (item) {
                                    return Lampa.Maker.make('Season', item, function (module) {
                                        return module.only('Line', 'Callback');
                                    });
                                },
                                emit: {
                                    onlyEnter: function () {
                                        Lampa.Router.call('holaself_tv_episodes', {
                                            show: object.show,
                                            movie: movie,
                                            episodes: seasonEpisodes,
                                            season: Number(seasonNumber)
                                        });
                                    }
                                }
                            }
                        };
                    });

                    this.build([{
                        title: 'Сезоны',
                        results: seasonResults
                    }]);

                    if (activity) {
                        activity.loader(false);
                        activity.toggle();
                    }
                }).catch(function () {
                    if (activity) {
                        activity.loader(false);
                        activity.toggle();
                    }
                    this.build([{
                        title: object.show && object.show.name,
                        results: []
                    }]);
                }.bind(this));
            }
        });

        return component;
    }

    function episodesComponent(object) {
        var movie = object.movie || {};
        var episodes = (object.episodes || []).slice().sort(function (a, b) {
            return Number(a.number || a.episode_number || 0) - Number(b.number || b.episode_number || 0);
        });

        var results = episodes.map(function (episode) {
            var number = Number(episode.number || episode.episode_number || 0);
            var season = Number(episode.season || episode.season_number || object.season || 1);

            return {
                episode_number: number,
                season_number: season,
                air_date: episode.airdate || episode.air_date || '',
                name: episode.name || ('Выпуск ' + number),
                title: episode.name || ('Выпуск ' + number),
                overview: episode.summary ? String(episode.summary).replace(/<[^>]+>/g, '') : '',
                runtime: episode.runtime || 0,
                original_name: movie.original_name,
                card: movie,
                showName: object.show && object.show.name,
                params: {
                    createInstance: function (data) {
                        return Lampa.Maker.make('Episode', data, function (module) {
                            return module.only('Line', 'Callback');
                        });
                    },
                    emit: {
                        onlyEnter: function () {
                            Lampa.Router.call('torrents', {
                                movie: movie,
                                search: torrentQuery(object.show.name, season, number),
                                clarification: true,
                                from_search: false
                            });
                        }
                    }
                }
            };
        });

        return makeMain({
            title: (object.show && object.show.name || 'ТВ-шоу') + ' — сезон ' + object.season,
            results: [{
                title: 'Выпуски',
                results: results
            }]
        });
    }

    function registerComponents() {
        if (!window.Lampa || !Lampa.Component || typeof Lampa.Component.add !== 'function') return false;
        if (!Lampa.Maker || typeof Lampa.Maker.make !== 'function') return false;

        if (!Lampa.Component.get('holaself_tv_channels')) Lampa.Component.add('holaself_tv_channels', channelsComponent);
        if (!Lampa.Component.get('holaself_tv_shows')) Lampa.Component.add('holaself_tv_shows', showsComponent);
        if (!Lampa.Component.get('holaself_tv_seasons')) Lampa.Component.add('holaself_tv_seasons', seasonsComponent);
        if (!Lampa.Component.get('holaself_tv_episodes')) Lampa.Component.add('holaself_tv_episodes', episodesComponent);

        return true;
    }

    function addMenuEntry() {
        if (menuAdded) return true;
        if (!registerComponents()) return false;
        if (!window.appready || !Lampa.Menu || typeof Lampa.Menu.addButton !== 'function') return false;

        try {
            var button = Lampa.Menu.addButton(
                '<svg viewBox="0 0 24 24"><path d="M4 6h16v10H4zM8 20h8M12 16v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
                'ТВ-шоу',
                function () {
                    getConfig().then(function (config) {
                        Lampa.Router.call('holaself_tv_channels', config);
                    });
                }
            );

            if (!button || !button.length) return false;

            button.attr('data-holaself-tv-shows', '1');

            var series = document.querySelector('.menu__item[data-action="tv"]');
            if (series && series.parentNode) series.parentNode.insertBefore(button[0], series.nextSibling);

            menuAdded = true;
            return true;
        } catch (error) {
            return false;
        }
    }

    function start() {
        registerComponents();

        var attempts = 0;
        function tryMenu() {
            attempts++;
            if (addMenuEntry()) return;
            if (attempts < 80) setTimeout(tryMenu, 250);
        }
        tryMenu();
    }

    function bootstrap() {
        if (window.appready) start();
        else if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
            Lampa.Listener.follow('app', function (event) {
                if (event && event.type === 'ready') start();
            });
        }

        setTimeout(function () {
            if (window.appready) start();
        }, 1000);
    }

    function init() {
        if (!window.Lampa) return setTimeout(init, 100);
        bootstrap();
    }

    init();
})(window);
