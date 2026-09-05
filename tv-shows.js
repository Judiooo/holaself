/*
 * TV-show catalogue UI.
 * Show/episode metadata is read from TVmaze. Torrent search and playback are
 * delegated to the Lampa Parser/Torrent modules, so the same TorrServer setup
 * used by the rest of Lampa is reused here.
 */
(function (window) {
    'use strict';

    var CONFIG = {
        configUrl: 'tv-shows.json',
        tvmazeUrl: 'https://api.tvmaze.com/shows/',
        labels: {
            title: 'ТВ-шоу',
            channels: 'Телеканалы',
            shows: 'Передачи',
            seasons: 'Сезоны',
            episodes: 'Выпуски',
            torrents: 'Торренты'
        }
    };

    window.TV_SHOWS_CONFIG = CONFIG;

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

    function torrentQuery(ep) {
        return ep.showName + ' S' + pad2(ep.season) + 'E' + pad2(ep.number);
    }

    function openTorrent(item, movie) {
        if (!window.Lampa || !window.Lampa.Torrent || typeof window.Lampa.Torrent.start !== 'function') {
            throw new Error('Lampa Torrent API is not available');
        }
        var torrent = {
            Title: item.Title || item.title,
            MagnetUri: item.MagnetUri || item.magnet || '',
            Link: item.Link || item.url || '',
            Seeders: item.Seeders || item.seeders || 0,
            Peers: item.Peers || item.peers || 0,
            Size: item.Size || item.size || 0,
            hash: item.hash || ''
        };
        window.Lampa.Torrent.start(torrent, movie);
    }

    function searchTorrents(ep, movie, done, fail) {
        if (!window.Lampa || !window.Lampa.Parser || typeof window.Lampa.Parser.get !== 'function') {
            fail(new Error('Lampa Parser API is not available'));
            return;
        }
        var query = torrentQuery(ep);
        window.Lampa.Parser.get({
            search: encodeURIComponent(query),
            from_search: true
        }, function (json) {
            var results = [];
            (json || []).forEach(function (group) {
                (group.Results || group.results || []).forEach(function (item) { results.push(item); });
            });
            results.sort(function (a, b) { return (b.Seeders || 0) - (a.Seeders || 0); });
            done(results.slice(0, 50));
        }, fail);
    }

    function buildSeasonMap(episodes) {
        return episodes.reduce(function (map, ep) {
            var season = ep.season || 1;
            (map[season] = map[season] || []).push(ep);
            return map;
        }, {});
    }

    function mount() {
        var panel = document.getElementById('tv-shows-panel');
        var grid = document.getElementById('tv-shows-grid');
        var title = document.getElementById('tv-shows-title');
        var back = document.getElementById('tv-shows-back');
        var entry = document.getElementById('tv-shows-entry');
        var close = document.getElementById('tv-shows-close');
        if (!panel || !grid) return;
        if (panel.__tvMounted) return;
        panel.__tvMounted = true;

        var state = {
            level: 'channels',
            config: null,
            channel: null,
            show: null,
            movie: null,
            episodes: [],
            season: null
        };

        function header(text, canBack) {
            if (title) title.textContent = text;
            if (back) back.style.display = canBack ? '' : 'none';
        }

        function focusFirst() {
            var first = grid.querySelector('.tv-show-card');
            if (first) first.focus();
        }

        function cards(items, render, open) {
            grid.innerHTML = '';
            items.forEach(function (item, index) {
                var card = document.createElement('div');
                card.className = 'tv-show-card';
                card.tabIndex = 0;
                card.innerHTML = render(item, index);
                card.addEventListener('click', function () { open(item); });
                card.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        open(item);
                    }
                });
                grid.appendChild(card);
            });
            if (!items.length) grid.innerHTML = '<div class="tv-show-empty">Ничего не найдено.</div>';
            focusFirst();
        }

        function showChannels() {
            state.level = 'channels';
            state.channel = null;
            header('ТВ-шоу', false);
            cards((state.config.channels || []).filter(function (x) { return x.enabled !== false; }), function (channel) {
                return '<div class="tv-show-card__name">' + esc(channel.name) + '</div><div class="tv-show-card__status">' + ((channel.shows || []).length) + ' передач</div>';
            }, showShows);
        }

        function showShows(channel) {
            state.level = 'shows';
            state.channel = channel;
            header(channel.name, true);
            cards(channel.shows || [], function (show) {
                return '<div class="tv-show-card__name">' + esc(show.name) + '</div><div class="tv-show-card__status">Сезоны и выпуски</div>';
            }, loadShow);
        }

        function loadShow(show) {
            state.show = show;
            state.level = 'seasons';
            grid.innerHTML = '<div class="tv-show-empty">Загрузка сезонов и выпусков…</div>';
            Promise.all([
                apiGet(CONFIG.tvmazeUrl + encodeURIComponent(show.id)),
                apiGet(CONFIG.tvmazeUrl + encodeURIComponent(show.id) + '/episodes')
            ]).then(function (data) {
                var details = data[0];
                state.movie = {
                    id: details.id,
                    name: details.name || show.name,
                    title: details.name || show.name,
                    original_name: details.name || show.name,
                    first_air_date: details.premiered || '',
                    number_of_seasons: details.status === 'Ended' ? 0 : 1,
                    source: 'tvmaze'
                };
                state.episodes = data[1].map(function (ep) {
                    ep.showName = show.name;
                    return ep;
                });
                showSeasons();
            }).catch(function () {
                grid.innerHTML = '<div class="tv-show-empty">Не удалось получить список выпусков.</div>';
            });
        }

        function showSeasons() {
            var seasons = buildSeasonMap(state.episodes);
            state.level = 'seasons';
            header(state.show.name + ' — сезоны', true);
            cards(Object.keys(seasons).sort(function (a, b) { return Number(a) - Number(b); }).map(function (number) {
                return { number: number, count: seasons[number].length, episodes: seasons[number] };
            }), function (season) {
                return '<div class="tv-show-card__name">Сезон ' + esc(season.number) + '</div><div class="tv-show-card__status">' + season.count + ' выпусков</div>';
            }, function (season) {
                showEpisodes(season.episodes, season.number);
            });
        }

        function showEpisodes(episodes, season) {
            state.level = 'episodes';
            state.season = season;
            header(state.show.name + ' — сезон ' + season, true);
            episodes.sort(function (a, b) { return Number(a.number) - Number(b.number); });
            cards(episodes, function (ep) {
                return '<div class="tv-show-card__name">' + esc(ep.number) + '. ' + esc(ep.name) + '</div><div class="tv-show-card__status">' + esc(ep.airdate || '') + ' · Торренты</div>';
            }, findTorrents);
        }

        function findTorrents(ep) {
            state.level = 'torrents';
            header(ep.showName + ' — ' + ep.name, true);
            grid.innerHTML = '<div class="tv-show-empty">Поиск торрентов: ' + esc(torrentQuery(ep)) + '…</div>';
            searchTorrents(ep, state.movie, function (items) {
                cards(items, function (item) {
                    var size = item.size || item.Size || '';
                    return '<div class="tv-show-card__name">' + esc(item.Title || item.title || 'Раздача') + '</div><div class="tv-show-card__status">' + esc(size) + ' · ' + esc(item.Seeders || 0) + ' сидов · TorrServer</div>';
                }, function (item) {
                    try { openTorrent(item, state.movie); }
                    catch (e) { grid.innerHTML = '<div class="tv-show-empty">Не удалось открыть торрент через Lampa/TorrServer.</div>'; }
                });
            }, function () {
                grid.innerHTML = '<div class="tv-show-empty">Не удалось выполнить поиск. Проверьте настройки парсера и TorrServer в Lampa.</div>';
            });
        }

        function open() {
            panel.classList.add('is-visible');
            panel.setAttribute('aria-hidden', 'false');
            showChannels();
        }

        function hide() {
            panel.classList.remove('is-visible');
            panel.setAttribute('aria-hidden', 'true');
            if (entry) entry.focus();
        }

        if (entry) entry.addEventListener('click', open);
        if (close) close.addEventListener('click', hide);
        if (back) back.addEventListener('click', function () {
            if (state.level === 'shows') showChannels();
            else if (state.level === 'seasons') showShows(state.channel);
            else if (state.level === 'episodes') showSeasons();
            else if (state.level === 'torrents') showEpisodes(state.episodes.filter(function (e) { return String(e.season) === String(state.season); }), state.season);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && panel.classList.contains('is-visible')) hide();
        });

        fetch(CONFIG.configUrl + '?v=' + Date.now()).then(function (r) { return r.json(); }).then(function (config) {
            state.config = config;
            if (panel.classList.contains('is-visible')) showChannels();
        }).catch(function () { state.config = { channels: [] }; });

        window.HolaSelfTV = { open: open, close: hide };
    }

    window.initTvShows = mount;
})(window);