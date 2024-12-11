const express = require('express');
const axios = require('axios');
const session = require('express-session');
const app = express();
const port = process.env.PORT;

app.use(express.json());
app.use(session({ secret: process.env.COOKIE_SECRET, resave: false, saveUninitialized: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    if (req.session.spotifyToken || req.session.deezerToken) {
        res.sendFile(__dirname + '/app.html');
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/login.html');
});

app.get('/auth/spotify', (req, res) => {
    res.redirect(`https://accounts.spotify.com/authorize?client_id=${process.env.SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${process.env.BASE_URL}/auth/spotify/callback&scope=playlist-modify-private playlist-read-private user-top-read user-library-read&state=${process.env.SPOTIFY_STATE}`);
});

app.get('/auth/spotify/callback', async (req, res) => {
    const { code, state } = req.query;

    if (state !== process.env.SPOTIFY_STATE) {
        return res.status(400).send('Invalid state parameter');
    }

    const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.BASE_URL+'/auth/spotify/callback',
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET
    }), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    req.session.spotifyToken = response.data.access_token;
    res.redirect('/');
});

app.get('/auth/deezer', (req, res) => {
    res.send('Deezer app creation form is currently closed so I can\'t implement deezer auth');
});

app.get('/playlist/:id', (req, res) => {
    res.sendFile(__dirname + '/playlist.html');
});

app.post('/api/profile', (req, res) => {
    if (!req.session.spotifyToken && !req.session.deezerToken) {
        return res.status(401).send('Unauthorized');
    }

    if (req.session.spotifyToken) {
        axios.get('https://api.spotify.com/v1/me', {
            headers: {
                Authorization: `Bearer ${req.session.spotifyToken}`
            }
        }).then(response => {
            res.send(response.data);
        }).catch(error => {
            res.status(error.response.status).send(error.response.data);
        }
        );
    } else {
        res.send('Deezer not implemented yet');
    }
});

app.post('/api/playlists', async (req, res) => {
    if (!req.session.spotifyToken) {
        return res.status(401).send('Unauthorized');
    }

    const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
        headers: {
            Authorization: `Bearer ${req.session.spotifyToken}`
        }
    });

    res.send(response.data);
});

app.post('/api/playlist', async (req, res) => {
    if (!req.session.spotifyToken) {
        return res.status(401).send('Unauthorized');
    }

    const { playlistId } = req.body;

    if (!playlistId) {
        return res.status(400).send('Missing playlistId');
    }

    if(playlistId === 'liked') { 
        res.send({
            playlist: {
                name: 'Liked Songs',
            }
        });
    } else if(playlistId === 'top') {
        res.send({
            playlist: {
                name: 'Top Songs'
            }
        });
    } else {

    const playlistinfo = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: {
            Authorization: `Bearer ${req.session.spotifyToken}`
        }
    });

    res.send({
        playlist: playlistinfo.data,
    });

    }

});

app.post('/api/sort', async (req, res) => {
    if (!req.session.spotifyToken) {
        return res.status(401).send('Unauthorized');
    }

    const { playlistId, sortType } = req.body;

    if (!playlistId) {
        return res.status(400).send('Missing playlistId');
    }

    if (!sortType) {
        return res.status(400).send('Missing sortType');
    }

    let songs = [];

    if(playlistId === 'liked') {
        const favoriteSongsPlaylist = [];
        const limit = 50;
        let offset = 0;
        let total = 0;
    
        do {
            const response = await axios.get(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, {
                headers: {
                    Authorization: `Bearer ${req.session.spotifyToken}`
                }
            }).catch(error => { res.status(error.response.status).send(error.response.data);console.log(error) } );
            favoriteSongsPlaylist.push(...response.data.items);
            offset += limit;
            total = response.data.total;
        } while (offset < total);
    
        songs = favoriteSongsPlaylist;
    } else if(playlistId === 'top') {
        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: {
                Authorization: `Bearer ${req.session.spotifyToken}`
            }
        }).catch(error => { res.status(error.response.status).send(error.response.data); } );
        
        songs = response.data.items.map(item => { return { track: item }; });
    } else {

    const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        headers: {
            Authorization: `Bearer ${req.session.spotifyToken}`
        }
    });

    songs = response.data.items;

    }

    // Todo : add duration sorting (idk, it could be useful)

    switch (sortType) {
        case 'release':     
            let years = [];
            songs.forEach(song => {
                let year = song.track.album.release_date.split('-')[0];
                if (!years.find(y => y.name === year)) {
                    years.push({
                        name: year,
                        songs: []
                    });
                }
                let yearIndex = years.findIndex(y => y.name === year);
                years[yearIndex].songs.push(song);
            });
            years.sort((a, b) => b.name - a.name); 
            res.send(years);  
            break;
        case 'popularity':
            let popularities = [];
            songs.forEach(song => {
                let popularity = song.track.popularity;
                let range = Math.floor(popularity / 20);
                if (!popularities.find(p => p.name === range)) {
                    popularities.push({
                        name: range,
                        songs: []
                    });
                }
                let popularityIndex = popularities.findIndex(p => p.name === range);
                popularities[popularityIndex].songs.push(song);
            }
            );        
            popularities.sort((a, b) => b.name - a.name);
            popularities.forEach(popularity => {
                switch (popularity.name) {
                    case 0:
                        popularity.name = '⭐';
                        break;
                    case 1:
                        popularity.name = '⭐⭐';
                        break;
                    case 2:
                        popularity.name = '⭐⭐⭐';
                        break;
                    case 3:
                        popularity.name = '⭐⭐⭐⭐';
                        break;
                    case 4:
                        popularity.name = '⭐⭐⭐⭐⭐';
                        break;
                }
            });
            res.send(popularities);                    
                break;

        case 'artist':
            let artists = [];
            songs.forEach(song => {
                let artist = song.track.artists[0].name;
                if (!artists.find(a => a.name === artist)) {
                    artists.push({
                        name: artist,
                        songs: []
                    });
                }
                let artistIndex = artists.findIndex(a => a.name === artist);
                artists[artistIndex].songs.push(song);
            }
            );
            artists.sort((a, b) => b.songs.length - a.songs.length);
            res.send(artists);
            break;
        default:
            res.send('Invalid sort type');
            break;
    }

});

app.post('/api/export', async (req, res) => {
    if(!req.session.spotifyToken) {
        return res.status(401).send('Unauthorized');
    }
    if(!req.body.name) {
        return res.status(400).send('Missing playlist name');
    }
    if(!req.body.songs) {
        return res.status(400).send('Missing songs');
    }
    
    const { name, songs } = req.body;
    const playlist = await axios.post('https://api.spotify.com/v1/me/playlists', {
        name,
        description: 'Playlist created with SortMySongs',
        public: false
    }, {
        headers: {
            Authorization: `Bearer ${req.session.spotifyToken}`,
            'Content-Type': 'application/json'
        }

    }).catch(error => { res.status(error.response.status).send(error.response.data); } );

    const playlistId = playlist.data.id;
    const uris = songs.map(song => song.track.uri);
    await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        uris
    }, {
        headers: {
            Authorization: `Bearer ${req.session.spotifyToken}`,
            'Content-Type': 'application/json'
        }
    }).catch(error => { res.status(error.response.status).send(error.response.data); } );

    res.send({ playlistId });
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});