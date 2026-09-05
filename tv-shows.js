/*
 * TV-show catalogue UI.
 * Show metadata is resolved through TVmaze when a catalogue entry has no ID.
 * Torrent search/playback is delegated to the Lampa Parser/Torrent modules,
 * reusing the same TorrServer configuration as the rest of Lampa.
 */
(function (window) {
    'use strict';

    var CONFIG = {
        configUrl: 'tv-shows.json',
        tvmazeUrl: 'https://api.tvmaze.com/',
        labels: { title:'ТВ-шоу', channels:'Телеканалы', shows:'Передачи', seasons:'Сезоны', episodes:'Выпуски', torrents:'Торренты' }
    };
    window.TV_SHOWS_CONFIG = CONFIG;

    function esc(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function apiGet(url) { return fetch(url,{credentials:'omit'}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }); }
    function pad2(v) { v=String(v); return v.length<2?'0'+v:v; }

    function torrentQueries(ep) {
        var aliases = ep.torrent_queries || [];
        var main = ep.showName + ' S' + pad2(ep.season) + 'E' + pad2(ep.number);
        var variants = [main, ep.showName + ' ' + ep.season + 'x' + pad2(ep.number)];
        aliases.forEach(function(alias){
            if(alias && variants.indexOf(alias) < 0) variants.push(alias);
        });
        return variants;
    }

    function torrentQuery(ep) { return torrentQueries(ep)[0]; }

    function normalizeResults(json) {
        var results=[];
        if (json && Array.isArray(json.Results)) results=json.Results.slice();
        else if (json && Array.isArray(json.results)) results=json.results.slice();
        else if (Array.isArray(json)) {
            json.forEach(function(group){
                if (group && Array.isArray(group.Results)) results=results.concat(group.Results);
                else if (group && Array.isArray(group.results)) results=results.concat(group.results);
                else if (group && (group.Title || group.title || group.MagnetUri || group.magnet)) results.push(group);
            });
        }
        return results;
    }

    function mergeTorrentResults(all) {
        var seen={}, results=[];
        all.forEach(function(item){
            var key=item.MagnetUri||item.magnet||item.Link||item.url||((item.Title||item.title||'')+'|'+(item.Size||item.size||'')+'|'+(item.Tracker||item.tracker||''));
            if(!seen[key]) { seen[key]=true; results.push(item); }
        });
        results.sort(function(a,b){ return Number(b.Seeders||b.seeders||0)-Number(a.Seeders||a.seeders||0); });
        return results.slice(0,50);
    }

    function openTorrent(item, movie) {
        if (!window.Lampa || !window.Lampa.Torrent || typeof window.Lampa.Torrent.start !== 'function') throw new Error('Lampa Torrent API is not available');
        var torrent = {
            Title:item.Title||item.title, MagnetUri:item.MagnetUri||item.magnet||'', Link:item.Link||item.url||'',
            Seeders:item.Seeders||item.seeders||0, Peers:item.Peers||item.peers||0, Size:item.Size||item.size||0, hash:item.hash||''
        };
        window.Lampa.Torrent.start(torrent,movie);
    }

    function searchTorrents(ep,movie,done,fail) {
        if (!window.Lampa || !window.Lampa.Parser || typeof window.Lampa.Parser.get !== 'function') { fail(new Error('Lampa Parser API is not available')); return; }
        var queries=torrentQueries(ep), pending=queries.length, all=[], hadSuccess=false, firstError=null;
        function complete(){
            pending--;
            if(pending>0)return;
            if(hadSuccess) done(mergeTorrentResults(all));
            else fail(firstError||new Error('Parser search failed'));
        }
        queries.forEach(function(query){
            var params={search:query,movie:movie,clarification:true};
            try {
                window.Lampa.Parser.get(params,function(json){
                    hadSuccess=true;
                    all=all.concat(normalizeResults(json));
                    complete();
                },function(error){
                    if(!firstError)firstError=error;
                    complete();
                });
            } catch(error) {
                if(!firstError)firstError=error;
                complete();
            }
        });
    }

    function buildSeasonMap(episodes) { return episodes.reduce(function(map,ep){ var s=ep.season||1; (map[s]=map[s]||[]).push(ep); return map; },{}); }

    function resolveShow(show) {
        if (show.id) return apiGet(CONFIG.tvmazeUrl+'shows/'+encodeURIComponent(show.id));
        var query = encodeURIComponent(show.name);
        return apiGet(CONFIG.tvmazeUrl+'search/shows?q='+query).then(function(items){
            if (!items || !items.length) throw new Error('TV show not found: '+show.name);
            var exact=items.filter(function(item){return item.show&&String(item.show.name).toLowerCase()===String(show.name).toLowerCase();});
            return (exact[0]||items[0]).show;
        });
    }

    function mount() {
        var panel=document.getElementById('tv-shows-panel'), grid=document.getElementById('tv-shows-grid'), title=document.getElementById('tv-shows-title'), back=document.getElementById('tv-shows-back'), entry=document.getElementById('tv-shows-entry'), close=document.getElementById('tv-shows-close');
        if(!panel||!grid||panel.__tvMounted)return;
        panel.__tvMounted=true;
        var state={level:'channels',config:null,channel:null,show:null,movie:null,episodes:[],season:null};
        function header(text,canBack){if(title)title.textContent=text;if(back)back.style.display=canBack?'':'none';}
        function focusFirst(){var first=grid.querySelector('.tv-show-card');if(first)first.focus();}
        function cards(items,render,open){grid.innerHTML='';items.forEach(function(item,index){var card=document.createElement('div');card.className='tv-show-card';card.tabIndex=0;card.innerHTML=render(item,index);card.addEventListener('click',function(){open(item);});card.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(item);}});grid.appendChild(card);});if(!items.length)grid.innerHTML='<div class="tv-show-empty">Ничего не найдено.</div>';focusFirst();}
        function showChannels(){state.level='channels';state.channel=null;header('ТВ-шоу',false);cards((state.config.channels||[]).filter(function(x){return x.enabled!==false;}),function(c){return '<div class="tv-show-card__name">'+esc(c.name)+'</div><div class="tv-show-card__status">'+((c.shows||[]).length)+' передач</div>';},showShows);}
        function showShows(channel){state.level='shows';state.channel=channel;header(channel.name,true);cards(channel.shows||[],function(s){return '<div class="tv-show-card__name">'+esc(s.name)+'</div><div class="tv-show-card__status">Сезоны и выпуски</div>';},loadShow);}
        function loadShow(show){state.show=show;state.level='seasons';grid.innerHTML='<div class="tv-show-empty">Загрузка сезонов и выпусков…</div>';resolveShow(show).then(function(details){return apiGet(CONFIG.tvmazeUrl+'shows/'+encodeURIComponent(details.id)+'/episodes').then(function(eps){return {details:details,episodes:eps};});}).then(function(data){var d=data.details;state.movie={id:d.id,name:d.name||show.name,title:d.name||show.name,original_name:d.name||show.name,original_title:d.name||show.name,first_air_date:d.premiered||'',genres:(d.genres||[]).map(function(name){return {name:name};}),is_serial:true,number_of_seasons:1,source:'tvmaze'};state.episodes=data.episodes.map(function(ep){ep.showName=show.name;ep.torrent_queries=show.torrent_queries||show.queries||[];return ep;});showSeasons();}).catch(function(){grid.innerHTML='<div class="tv-show-empty">Не удалось получить сезоны и выпуски для «'+esc(show.name)+'».</div>';});}
        function showSeasons(){var seasons=buildSeasonMap(state.episodes);state.level='seasons';header(state.show.name+' — сезоны',true);cards(Object.keys(seasons).sort(function(a,b){return Number(a)-Number(b);}).map(function(n){return {number:n,count:seasons[n].length,episodes:seasons[n]};}),function(s){return '<div class="tv-show-card__name">Сезон '+esc(s.number)+'</div><div class="tv-show-card__status">'+s.count+' выпусков</div>';},function(s){showEpisodes(s.episodes,s.number);});}
        function showEpisodes(episodes,season){state.level='episodes';state.season=season;header(state.show.name+' — сезон '+season,true);episodes.sort(function(a,b){return Number(a.number)-Number(b.number);});cards(episodes,function(ep){return '<div class="tv-show-card__name">'+esc(ep.number)+'. '+esc(ep.name)+'</div><div class="tv-show-card__status">'+esc(ep.airdate||'')+' · Торренты</div>';},findTorrents);}
        function findTorrents(ep){state.level='torrents';header(ep.showName+' — '+ep.name,true);grid.innerHTML='<div class="tv-show-empty">Поиск торрентов: '+esc(torrentQuery(ep))+'…</div>';searchTorrents(ep,state.movie,function(items){cards(items,function(item){var size=item.size||item.Size||'';return '<div class="tv-show-card__name">'+esc(item.Title||item.title||'Раздача')+'</div><div class="tv-show-card__status">'+esc(size)+' · '+esc(item.Seeders||item.seeders||0)+' сидов · TorrServer</div>';},function(item){try{openTorrent(item,state.movie);}catch(e){grid.innerHTML='<div class="tv-show-empty">Не удалось открыть торрент через Lampa/TorrServer.</div>';}});},function(){grid.innerHTML='<div class="tv-show-empty">Не удалось выполнить поиск. Проверьте настройки парсера и TorrServer в Lampa.</div>';});}
        function open(){panel.classList.add('is-visible');panel.setAttribute('aria-hidden','false');showChannels();}
        function hide(){panel.classList.remove('is-visible');panel.setAttribute('aria-hidden','true');if(entry)entry.focus();}
        if(entry)entry.addEventListener('click',open);if(close)close.addEventListener('click',hide);if(back)back.addEventListener('click',function(){if(state.level==='shows')showChannels();else if(state.level==='seasons')showShows(state.channel);else if(state.level==='episodes')showSeasons();else if(state.level==='torrents')showEpisodes(state.episodes.filter(function(e){return String(e.season)===String(state.season);}),state.season);});
        document.addEventListener('keydown',function(e){if(e.key==='Escape'&&panel.classList.contains('is-visible'))hide();});
        fetch(CONFIG.configUrl+'?v='+Date.now()).then(function(r){return r.json();}).then(function(config){state.config=config;if(panel.classList.contains('is-visible'))showChannels();}).catch(function(){state.config={channels:[]};});
        window.HolaSelfTV={open:open,close:hide};
    }
    window.initTvShows=mount;
})(window);
