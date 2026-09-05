(function () {
    'use strict';

    var plugins = [
        'collections',
        'dlna',
        'etor',
        'halloween',
        'iptv',
        'online',
        'online_prestige',
        'radio',
        'record',
        'shots',
        'snow',
        'tmdb_proxy',
        'tracks',
        'twolines',
        'view_plugin',
        'womens-day'
    ];

    function load(name) {
        return new Promise(function (resolve) {
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = './plugins/' + name + '.js?v=1';
            script.onload = function () {
                console.log('holaself plugin loaded:', name);
                resolve();
            };
            script.onerror = function () {
                console.error('holaself plugin failed:', name);
                resolve();
            };
            document.body.appendChild(script);
        });
    }

    function start() {
        plugins.reduce(function (chain, name) {
            return chain.then(function () { return load(name); });
        }, Promise.resolve()).then(function () {
            console.log('holaself plugins ready');
        });
    }

    if (window.appready) start();
    else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    } else {
        var timer = setInterval(function () {
            if (window.appready || (window.Lampa && Lampa.Listener)) {
                clearInterval(timer);
                if (window.appready) start();
                else Lampa.Listener.follow('app', function (event) {
                    if (event.type === 'ready') start();
                });
            }
        }, 250);
    }
})();
