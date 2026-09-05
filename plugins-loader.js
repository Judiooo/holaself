(function () {
    'use strict';

    // Register bundled plugins in Lampa's native Extensions storage.
    // They are installed but disabled by default. Lampa will load a plugin
    // only after the user enables it from Settings -> Extensions.
    var plugins = [
        { file: 'collections', name: 'Collections', author: '@yumata' },
        { file: 'dlna', name: 'DLNA', author: '@yumata' },
        { file: 'etor', name: 'ETOR', author: '@yumata' },
        { file: 'halloween', name: 'Halloween', author: '@yumata' },
        { file: 'iptv', name: 'IPTV', author: '@yumata' },
        { file: 'online', name: 'Online', author: '@yumata' },
        { file: 'online_prestige', name: 'Online Prestige', author: '@yumata' },
        { file: 'radio', name: 'Radio', author: '@yumata' },
        { file: 'record', name: 'Record', author: '@yumata' },
        { file: 'shots', name: 'Shots', author: '@yumata' },
        { file: 'snow', name: 'Snow', author: '@yumata' },
        { file: 'tmdb_proxy', name: 'TMDB Proxy', author: '@yumata' },
        { file: 'tracks', name: 'Tracks', author: '@yumata' },
        { file: 'twolines', name: 'Two Lines', author: '@yumata' },
        { file: 'view_plugin', name: 'Plugin Manager', author: '@yumata' },
        { file: 'womens-day', name: "Women's Day", author: '@yumata' }
    ];

    function register() {
        var current = [];

        try {
            current = JSON.parse(window.localStorage.getItem('plugins') || '[]');
        }
        catch (e) {
            current = [];
        }

        if (!Array.isArray(current)) current = [];

        plugins.forEach(function (plugin) {
            var url = './plugins/' + plugin.file + '.js';
            var exists = current.find(function (item) {
                return (typeof item === 'string' ? item : item && item.url) === url;
            });

            if (!exists) {
                current.push({
                    url: url,
                    status: 0,
                    name: plugin.name,
                    author: plugin.author,
                    descr: 'Встроенное расширение holaself'
                });
            }
        });

        try {
            window.localStorage.setItem('plugins', JSON.stringify(current));
            console.log('holaself: bundled plugins registered in Extensions');
        }
        catch (e) {
            console.error('holaself: failed to register bundled plugins', e);
        }
    }

    // This file is loaded before app.min.js, so localStorage is populated
    // before Lampa initializes its Plugins module.
    register();
})();
