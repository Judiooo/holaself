/*
 * TV-show catalogue UI.
 * Metadata comes from the local configuration and TVmaze's public API.
 * Torrent resolution is delegated to a user-configured Torznab/Jackett endpoint;
 * the project does not contain copyrighted torrent links.
 */
(function (window) {
    'use strict';

    var CONFIG = {
        configUrl: 'tv-shows.json',
        tvmazeUrl: 'https://api.tvmaze.com/shows/',
        torznabUrl: '',
        torznabApiKey: '',
        torrServerUrl: '',
        labels: {
            title: 'ТВ-шоу',
            channels: 'Телеканалы',
            shows: 'Передачи',
            seasons: 'Сезоны',
            episodes: 'Выпуски',
            torrents: 'Торренты',
            watch: 'Смотреть'
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

    function getEpisodeTorrents(episode) {
        if (!CONFIG.torznabUrl) return Promise.resolve([]);
        var query = encodeURIComponent((episode.showName || '') + ' ' + (episode.season ? 'S' + String(episode.season).padStart(2, '0') : '') + ' ' + (episode.number ? 'E' + String(episode.number).padStart(2, '0') : '') + ' ' + (episode.name || ''));
        var url = CONFIG.torznabUrl.replace(/\/$/, '') + '/api?t=search&q=' + query;
        if (CONFIG.torznabApiKey) url += '&apikey=' + encodeURIComponent(CONFIG.torznabApiKey);
        return fetch(url, { credentials: 'omit' }).then(function (r) {
            if (!r.ok) throw new Error('Torznab HTTP ' + r.status);
            return r.text();
        }).then(function (xml) {
            var doc = new DOMParser().parseFromString(xml, 'application/xml');
            return Array.prototype.slice.call(doc.querySelectorAll('item')).map(function (item) {
                var enclosure = item.querySelector('enclosure');
                var magnet = item.querySelector('magnet') || item.querySelector('torznab\\:magnet');
                return {
                    title: (item.querySelector('title') || {}).textContent || 'Раздача',
                    url: enclosure ? enclosure.getAttribute('url') : '',
                    magnet: magnet ? magnet.textContent : '',
                    size: (item.querySelector('size') || {}).textContent || ''
                };
            }).filter(function (x) { return x.url || x.magnet; });
        });
    }

    function playTorrent(torrent) {
        if (!CONFIG.torrServerUrl) {
            alert('Укажите адрес TorrServer в tv-shows.js');
            return;
        }

        /*
         * TorrServer API differs between deployments. We keep the integration
         * adapter here instead of guessing an API contract. If the host Lampa
         * build exposes its torrent player, hand the torrent to it; otherwise
         * show the exact source that must be configured in the existing Lampa
         * torrent parser.
         */
        var payload = torrent.magnet || torrent.url;
        if (window.Lampa && window.Lampa.Player && typeof window.Lampa.Player.open === 'function') {
            window.Lampa.Player.open({ url: payload, title: torrent.title });
            return;
        }
        if (window.lampa && window.lampa.Player && typeof window.lampa.Player.open === 'function') {
            window.lampa.Player.open({ url: payload, title: torrent.title });
            return;
        }
        alert('Раздача найдена. Подключите её через торрент-плеер Lampa/TorrServer: ' + torrent.title);
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
        if (!panel || !grid) return;

        var state = { level: 'channels', channel: null, show: null, episodes: [] };

        function header(text, canBack) {
            if (title) title.textContent = text;
            if (back) {
                back.style.display = canBack ? '' : 'none';
                back.textContent = 'Назад';
            }
        }

        function cards(items, render) {
            grid.innerHTML = '';
            items.forEach(function (item, index) {
                var card = document.createElement('div');
                card.className = 'tv-show-card';
                card.tabIndex = 0;
                card.innerHTML = render(item, index);
                card.addEventListener('click', function () { item.__open(); });
                card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') item.__open(); });
                grid.appendChild(card);
            });
            if (!items.length) grid.innerHTML = '<div class="tv-show-empty">Ничего не найдено.</div>';
        }

        function showChannels(config) {
            state.level = 'channels'; state.channel = null; state.show = null;
            header('ТВ-шоу', false);
            cards((config.channels || []).filter(function (x) { return x.enabled !== false; }).map(function (channel) {
                channel.__open = function () { showShows(channel); };
                return channel;
            }), function (channel) {
                return '<div class="tv-show-card__name">' + esc(channel.name) + '</div><div class="tv-show-card__status">' + ((channel.shows || []).length) + ' передач</div>';
            });
        }

        function showShows(channel) {
            state.level = 'shows'; state.channel = channel;
            header(channel.name, true);
            cards((channel.shows || []).map(function (show) {
                show.__open = function () { loadShow(show); };
                return show;
            }), function (show) {
                return '<div class="tv-show-card__name">' + esc(show.name) + '</div><div class="tv-show-card__status">Сезоны и выпуски</div>';
            });
        }

        function loadShow(show) {
            state.show = show;
            header(show.name, true);
            grid.innerHTML = '<div class="tv-show-empty">Загрузка сезонов…</div>';
            apiGet(CONFIG.tvmazeUrl + encodeURIComponent(show.id) + '/episodes').then(function (episodes) {
                state.episodes = episodes.map(function (ep) {
                    ep.showName = show.name;
                    return ep;
                });
                var seasons = buildSeasonMap(state.episodes);
                cards(Object.keys(seasons).sort(function (a,b) { return Number(a)-Number(b); }).map(function (season) {
                    var item = { season: season, count: seasons[season].length };
                    item.__open = function () { showEpisodes(seasons[season], season); };
                    return item;
                }), function (season) {
                    return '<div class="tv-show-card__name">Сезон ' + esc(season.season) + '</div><div class="tv-show-card__status">' + season.count + ' выпусков</div>';
                });
            }).catch(function () {
                grid.innerHTML = '<div class="tv-show-empty">Не удалось получить список выпусков. Проверьте доступ к TVmaze.</div>';
            });
        }

        function showEpisodes(episodes, season) {
            header(state.show.name + ' — сезон ' + season, true);
            cards(episodes.map(function (ep) {
                ep.__open = function () { findTorrents(ep); };
                return ep;
            }), function (ep) {
                var air = ep.airdate || '';
                return '<div class="tv-show-card__name">' + esc(ep.number) + '. ' + esc(ep.name) + '</div><div class="tv-show-card__status">' + esc(air) + ' · Торренты</div>';
            });
        }

        function findTorrents(ep) {
            header(ep.showName + ' — ' + ep.name, true);
            grid.innerHTML = '<div class="tv-show-empty">Поиск раздач…</div>';
            getEpisodeTorrents(ep).then(function (items) {
                cards(items.map(function (torrent) {
                    torrent.__open = function () { playTorrent(torrent); };
                    return torrent;
                }), function (torrent) {
                    return '<div class="tv-show-card__name">' + esc(torrent.title) + '</div><div class="tv-show-card__status">' + esc(torrent.size || 'TorrServer') + '</div>';
                });
                if (!items.length) grid.innerHTML = '<div class="tv-show-empty">Раздачи не найдены. Настройте Torznab/Jackett в tv-shows.js.</div>';
            }).catch(function () {
                grid.innerHTML = '<div class="tv-show-empty">Ошибка поиска торрентов. Проверьте Torznab/Jackett.</div>';
            });
        }

        if (back) back.addEventListener('click', function () {
            if (state.level === 'shows') showChannels(window.__TV_CONFIG || { channels: [] });
            else if (state.level === 'episodes') showShows(state.channel);
            else if (state.level === 'torrents') showEpisodes(state.episodes, state.episodes[0] ? state.episodes[0].season : 1);
        });

        fetch(CONFIG.configUrl + '?v=' + Date.now()).then(function (r) { return r.json(); }).then(function (config) {
            window.__TV_CONFIG = config;
            showChannels(config);
        }).catch(function () { showChannels({ channels: [] }); });
    }

    window.initTvShows = mount;
})(window);
