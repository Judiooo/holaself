/* holaself TV-shows: native Lampa screens only. */
(function (window) {
    'use strict';

    var CONFIG_URL = 'tv-shows.json';
    var TVMAZE_URL = 'https://api.tvmaze.com/';
    var configPromise = null;
    var menuAdded = false;

    function getConfig() {
        if (!configPromise) {
            configPromise = fetch(CONFIG_URL + '?v=' + Date.now(), { credentials: 'omit' }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
        }
        return configPromise;
    }

    function apiGet(url) {
        return fetch(url, { credentials: 'omit' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    function pad2(value) {
        value = String(value);
        return value.length < 2 ? '0' + value : value;
    }

    function torrentQuery(name, season, episode) {
        return name + ' S' + pad2(season) + 'E' + pad2(episode);
    }

    function resolveShow(show) {
        if (show && show.id) return apiGet(TVMAZE_URL + 'shows/' + encodeURIComponent(show.id));
        return apiGet(TVMAZE_URL + 'search/shows?q=' + encodeURIComponent(show.name)).then(function (items) {
            if (!items || !items.length) throw new Error('TV show not found');
            return (items.filter(function (x) {
                return x.show && String(x.show.name).toLowerCase() === String(show.name).toLowerCase();
            })[0] || items[0]).show;
        });
    }

    function main(data, onCreate) {
        var component = Lampa.Maker.make('Main', data);
        component.use({ onCreate: onCreate });
        return component;
    }

    function channelsComponent(object) {
        return main({ title: 'ТВ-шоу', results: [] }, function () {
            var results = (object.channels || []).filter(function (c) {
                return c.enabled !== false;
            }).map(function (channel) {
                return {
                    title: channel.name,
                    name: channel.name,
                    original_name: channel.name,
                    source: 'tvmaze',
                    params: { emit: { onlyEnter: function () {
                        Lampa.Router.call('holaself_tv_shows', { channel: channel });
                    } } }
                };
            });
            this.build([{ title: 'Телеканалы', results: results }]);
        });
    }

    function showsComponent(object) {
        var channel = object.channel || { name: 'ТВ-шоу', shows: [] };
        return main({ title: channel.name, results: [] }, function () {
            var results = (channel.shows || []).map(function (show) {
                return {
                    title: show.name,
                    name: show.name,
                    original_name: show.name,
                    source: 'tvmaze',
                    params: { emit: { onlyEnter: function () {
                        Lampa.Router.call('holaself_tv_seasons', { show: show });
                    } } }
                };
            });
            this.build([{ title: channel.name, results: results }]);
        });
    }

    function seasonsComponent(object) {
        var component = Lampa.Maker.make('Main', {
            title: object.show && object.show.name,
            results: []
        });

        component.use({
            onCreate: function () {
                var self = this;
                var activity = self.activity;
                if (activity) activity.loader(true);

                resolveShow(object.show).then(function (details) {
                    return apiGet(TVMAZE_URL + 'shows/' + encodeURIComponent(details.id) + '/episodes').then(function (episodes) {
                        return { details: details, episodes: episodes || [] };
                    });
                }).then(function (data) {
                    var details = data.details;
                    var episodes = data.episodes;
                    var seasons = {};
                    var movie = {
                        id: details.id,
                        name: details.name || object.show.name,
                        title: details.name || object.show.name,
                        original_name: details.name || object.show.name,
                        original_title: details.name || object.show.name,
                        first_air_date: details.premiered || '',
                        genres: (details.genres || []).map(function (g) { return { name: g }; }),
                        is_serial: true,
                        number_of_seasons: details.runtime ? 1 : 1,
                        source: 'tvmaze'
                    };

                    episodes.forEach(function (episode) {
                        var number = Number(episode.season || 1);
                        if (!seasons[number]) seasons[number] = [];
                        episode.original_name = movie.original_name;
                        episode.card = movie;
                        seasons[number].push(episode);
                    });

                    var results = Object.keys(seasons).sort(function (a, b) {
                        return Number(b) - Number(a);
                    }).map(function (number) {
                        var seasonEpisodes = seasons[number];
                        return {
                            season_number: Number(number),
                            season: Number(number),
                            name: 'Сезон ' + number,
                            title: 'Сезон ' + number,
                            episode_count: seasonEpisodes.length,
                            episodes: seasonEpisodes,
                            card: movie,
                            params: {
                                createInstance: function (item) {
                                    return Lampa.Maker.make('Season', item, function (module) {
                                        return module.only('Line', 'Callback');
                                    });
                                },
                                emit: { onlyEnter: function () {
                                    Lampa.Router.call('holaself_tv_episodes', {
                                        show: object.show,
                                        movie: movie,
                                        episodes: seasonEpisodes,
                                        season: Number(number)
                                    });
                                } }
                            }
                        };
                    });

                    self.build([{ title: 'Сезоны', results: results }]);
                    if (activity) {
                        activity.loader(false);
                        activity.toggle();
                    }
                }).catch(function (error) {
                    console.error('holaself TV seasons:', error);
                    if (activity) {
                        activity.loader(false);
                        activity.toggle();
                    }
                    self.build([{ title: object.show && object.show.name, results: [] }]);
                });
            }
        });

        return component;
    }

    function episodesComponent(object) {
        var movie = object.movie || {};
        var episodes = (object.episodes || []).slice().sort(function (a, b) {
            return Number(a.number || 0) - Number(b.number || 0);
        });

        return main({
            title: (object.show && object.show.name || 'ТВ-шоу') + ' — сезон ' + object.season,
            results: []
        }, function () {
            var results = episodes.map(function (episode) {
                var number = Number(episode.number || 0);
                var season = Number(episode.season || object.season || 1);
                return {
                    episode_number: number,
                    season_number: season,
                    air_date: episode.airdate || '',
                    name: episode.name || ('Выпуск ' + number),
                    title: episode.name || ('Выпуск ' + number),
                    overview: episode.summary ? String(episode.summary).replace(/<[^>]+>/g, '') : '',
                    runtime: episode.runtime || 0,
                    original_name: movie.original_name,
                    card: movie,
                    params: {
                        createInstance: function (item) {
                            return Lampa.Maker.make('Episode', item, function (module) {
                                return module.only('Line', 'Callback');
                            });
                        },
                        emit: { onlyEnter: function () {
                            Lampa.Router.call('torrents', {
                                movie: movie,
                                search: torrentQuery(object.show.name, season, number),
                                clarification: true,
                                from_search: false
                            });
                        } }
                    }
                };
            });
            this.build([{ title: 'Выпуски', results: results }]);
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
        if (menuAdded || !registerComponents()) return menuAdded;
        if (!window.appready || !Lampa.Menu || typeof Lampa.Menu.addButton !== 'function') return false;
        try {
            var button = Lampa.Menu.addButton('<svg viewBox="0 0 24 24"><path d="M4 6h16v10H4zM8 20h8M12 16v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>', 'ТВ-шоу', function () {
                getConfig().then(function (config) {
                    Lampa.Router.call('holaself_tv_channels', config);
                }).catch(function (error) { console.error('holaself TV config:', error); });
            });
            if (!button || !button.length) return false;
            button.attr('data-holaself-tv-shows', '1');
            var series = document.querySelector('.menu__item[data-action="tv"]');
            if (series && series.parentNode) series.parentNode.insertBefore(button[0], series.nextSibling);
            menuAdded = true;
            return true;
        } catch (error) {
            console.error('holaself TV menu:', error);
            return false;
        }
    }

    function start() {
        registerComponents();
        var attempts = 0;
        function retry() {
            if (addMenuEntry()) return;
            attempts++;
            if (attempts < 80) setTimeout(retry, 250);
        }
        retry();
    }

    function init() {
        if (!window.Lampa) return setTimeout(init, 100);
        if (window.appready) start();
        else if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
            Lampa.Listener.follow('app', function (event) {
                if (event && event.type === 'ready') start();
            });
        }
        setTimeout(function () { if (window.appready) start(); }, 1000);
    }

    init();
})(window);
