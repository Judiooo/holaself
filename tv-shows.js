/*
 * Local TV-show catalogue configuration.
 * The app can load this file from /tv-shows.json and render enabled channels.
 * Playback must use the existing Lampa/TorrServer pipeline; this file does not
 * embed or distribute copyrighted video/torrent links.
 */
(function (window) {
    'use strict';

    window.TV_SHOWS_CONFIG = {
        configUrl: 'tv-shows.json',
        playback: {
            type: 'torrserver',
            useExistingLampaTorrentFlow: true
        },
        labels: {
            title: 'ТВ-шоу',
            schedule: 'Расписание',
            channels: 'Телеканалы',
            watch: 'Смотреть'
        }
    };
})(window);
