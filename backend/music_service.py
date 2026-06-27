import os
import random
import json
import re
from fastapi import FastAPI, Query
from ytmusicapi import YTMusic
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

yt_client = None
auth_status = "invitado"
current_queue = [] 
played_history = [] 
current_source = None
disliked_artists = set() 
currently_playing_id = None
currently_playing_title = ""

def get_yt():
    global yt_client, auth_status
    if yt_client is not None: return yt_client
    headers_path = os.path.join(os.path.dirname(__file__), 'headers.json')
    if os.path.exists(headers_path):
        try:
            yt_client = YTMusic(headers_path)
            # Validación real: intentar obtener library para confirmar login
            yt_client.get_library_playlists(limit=1)
            auth_status = "logeado"
            print("DEBUG: Sesión de YouTube Music cargada correctamente.")
            return yt_client
        except Exception as e:
            print(f"DEBUG: Error al validar headers.json (posiblemente expirado): {str(e)}")
            yt_client = None
    
    print("DEBUG: Entrando como invitado (sesión no válida o inexistente).")
    yt_client = YTMusic()
    auth_status = "invitado"
    return yt_client

def extract_youtube_ids(text):
    """Extrae ID de video o de playlist"""
    v_id = None
    p_id = None
    if not text: return v_id, p_id
    
    v_match = re.search(r"(?:v=|\/|be\/|shorts\/)([0-9A-Za-z_-]{11})", text)
    if v_match: v_id = v_match.group(1)
    
    p_match = re.search(r"list=([0-9A-Za-z_-]{15,})", text) # IDs de playlist suelen ser más largos
    if p_match: p_id = p_match.group(1)
    
    return v_id, p_id

def get_accurate_metadata(yt, video_id):
    try:
        song_data = yt.get_song(video_id)
        if 'videoDetails' in song_data:
            details = song_data['videoDetails']
            return {"videoId": video_id, "title": details.get('title'), "artist": details.get('author')}
    except: pass
    return {"videoId": video_id, "title": "YouTube Video", "artist": "Link"}

def set_queue(tracks, source_name, clear=True):
    global current_queue, current_source, currently_playing_id
    if clear: current_queue = []
    new_entries = []
    existing_ids = {s['videoId'] for s in current_queue}
    if currently_playing_id: existing_ids.add(currently_playing_id)
    
    for t in tracks:
        v_id = t.get('videoId')
        if v_id and v_id not in existing_ids:
            artist = t['artists'][0]['name'] if t.get('artists') else "Unknown"
            if artist.lower() not in [a.lower() for a in disliked_artists]:
                new_entries.append({"videoId": v_id, "title": t.get('title', 'Unknown'), "artist": artist})
                existing_ids.add(v_id)
    
    if clear: current_queue = new_entries; current_source = source_name
    else: current_queue = new_entries + current_queue
    current_queue = current_queue[:100]

@app.get("/status")
def status():
    get_yt()
    return {"status": auth_status, "queue": current_queue, "history": played_history, "source": current_source}

@app.get("/history")
def get_history_list(limit: int = 20):
    global played_history
    return played_history[:limit]

@app.post("/queue/add")
def add_to_queue(q: str = Query(...)):
    global current_queue
    try:
        yt = get_yt()
        v_id, p_id = extract_youtube_ids(q)
        
        if p_id:
            data = yt.get_playlist(p_id, limit=50)
            tracks = data.get("tracks", [])
            if tracks:
                new_items = []
                for t in tracks:
                    if 'videoId' in t:
                        new_items.append({
                            "videoId": t['videoId'], 
                            "title": t.get('title', 'Unknown'), 
                            "artist": t['artists'][0]['name'] if t.get('artists') else "YouTube"
                        })
                current_queue.extend(new_items)
                return {"status": "added_playlist", "count": len(new_items)}
        
        if v_id:
            item = get_accurate_metadata(yt, v_id)
            if len(current_queue) >= 10: current_queue.insert(9, item)
            else: current_queue.append(item)
            return {"status": "added", "song": item}
            
        return {"error": "Link no reconocido"}
    except Exception as e: return {"error": str(e)}

def get_personal_mix():
    global current_queue, current_source, currently_playing_id, played_history
    yt = get_yt()
    print(f"DEBUG: Intentando obtener Mix Personal. Status: {auth_status}")
    if auth_status == "logeado":
        try:
            # 1. Intentar obtener la playlist oficial de "Tus me gusta" (ID constante 'LM')
            print("DEBUG: Cargando playlist 'LM' (Liked Songs)...")
            liked_data = yt.get_playlist('LM', limit=100)
            tracks = liked_data.get("tracks", [])
            
            if not tracks:
                # 2. Si falla LM, intentar buscar "Mi Supermix"
                print("DEBUG: LM vacía, buscando 'Mi Supermix'...")
                search_results = yt.search("Mi Supermix", filter="playlists")
                if search_results:
                    liked_data = yt.get_playlist(search_results[0]['playlistId'], limit=50)
                    tracks = liked_data.get("tracks", [])

            if tracks:
                random.shuffle(tracks)
                set_queue(tracks, "Tus Favoritos Reales")
                print(f"DEBUG: Mix cargado con {len(tracks)} canciones.")
                return True
            else:
                print("DEBUG: No se encontraron canciones en los favoritos.")
        except Exception as e:
            print(f"DEBUG: Error en get_personal_mix: {str(e)}")
    return False

@app.get("/search")
def search_song(q: Optional[str] = Query(None), type: str = Query("song")):
    global current_queue, current_source, played_history, currently_playing_id, currently_playing_title, disliked_artists
    try:
        yt = get_yt()
        q_raw = q or ""
        v_id, p_id = extract_youtube_ids(q_raw)

        # PRIORIDAD 0: COMANDO "SIGUIENTE" (Debe ser lo primero de todo)
        clean_q = q_raw.lower().replace("album", "").replace("cancion", "").replace("playlist", "").strip()
        if not clean_q or any(w in clean_q for w in ["siguiente", "next", "otra", "cambia"]):
            if current_queue:
                song = current_queue.pop(0)
                played_history.insert(0, song); currently_playing_id = song['videoId']; return song
            # Si no hay cola, forzamos que busque algo para no quedarse callado
            if not clean_q: clean_q = "pop hits"

        # PRIORIDAD 1: LINK DE PLAYLIST
        if p_id:
            data = yt.get_playlist(p_id, limit=50)
            tracks = data.get("tracks", [])
            if tracks:
                set_queue(tracks[1:], f"Playlist: {data['title']}")
                res = {"videoId": tracks[0]['videoId'], "title": tracks[0]['title'], "artist": tracks[0]['artists'][0]['name'] if tracks[0].get('artists') else "Unknown"}
                currently_playing_id = res['videoId']; played_history.insert(0, res); return res

        # PRIORIDAD 2: LINK DE VIDEO
        if v_id:
            res = get_accurate_metadata(yt, v_id)
            currently_playing_id = v_id; currently_playing_title = res['title']
            played_history.insert(0, res); return res

        # ¡ARREGLO 1! Limpiamos el texto sin destruir palabras
        clean_q = q_raw.lower()
        for word in ["playlist", "album", "álbum", "canciones", "canción", "cancion"]:
            clean_q = clean_q.replace(word, "")
        clean_q = clean_q.strip()

        # NUEVA PRIORIDAD 2.5: BUSCAR EN TUS PROPIAS PLAYLISTS PRIMERO
        if auth_status == "logeado" and clean_q:
            lib = yt.get_library_playlists(limit=100)
            target_playlist = next((p for p in lib if clean_q in p['title'].lower()), None)
            
            # ¡ARREGLO 2! Fallback inteligente: Si buscas "favoritas", busca tu lista "Favorite Songs"
            if not target_playlist and "favorit" in clean_q:
                target_playlist = next((p for p in lib if "favorit" in p['title'].lower()), None)
            
            if target_playlist:
                data = yt.get_playlist(target_playlist['playlistId'], limit=50)
                tracks = data.get("tracks", [])
                if tracks:
                    set_queue(tracks[1:], f"Tu Playlist: {data['title']}")
                    res_s = {"videoId": tracks[0]['videoId'], "title": tracks[0]['title'], "artist": tracks[0]['artists'][0]['name'] if tracks[0].get('artists') else "Unknown"}
                    currently_playing_id = res_s['videoId']; played_history.insert(0, res_s); return res_s

        # PRIORIDAD 3: MODO PERSONAL GENÉRICO
        # Usamos "favorit" para atrapar "favoritos", "favoritas" y "favorite"
        if any(w in clean_q for w in ["historial", "favorit", "mi musica", "mas escuchado", "mis me gusta", "liked"]):
            if get_personal_mix():
                if current_queue:
                    song = current_queue.pop(0)
                    played_history.insert(0, song); currently_playing_id = song['videoId']; return song
            else:
                return {"error": "No pude acceder a tus favoritos. ¿Estás logueado?"}

        # 4. MODO ARTISTA
        if type == "artist":
            res = yt.search(clean_q, filter="songs")
            only_artist = [s for s in res if s.get('artists') and clean_q in s['artists'][0]['name'].lower()]
            if only_artist:
                set_queue(only_artist[1:], f"Solo {only_artist[0]['artists'][0]['name']}")
                res_s = {"videoId": only_artist[0]['videoId'], "title": only_artist[0]['title'], "artist": only_artist[0]['artists'][0]['name']}
                currently_playing_id = res_s['videoId']; played_history.insert(0, res_s); return res_s

        # 5. MODO ALBUM
        if type == "album":
            res = yt.search(clean_q, filter="albums")
            if res:
                data = yt.get_album(res[0]['browseId'])
                tracks = data.get("tracks", [])
                if tracks:
                    set_queue(tracks[1:], f"Álbum: {data['title']}")
                    res_s = {"videoId": tracks[0]['videoId'], "title": tracks[0]['title'], "artist": data.get('artist', 'Various')}
                    currently_playing_id = res_s['videoId']; played_history.insert(0, res_s); return res_s

        # 6. MODO PLAYLIST
        if type == "playlist":
            res = yt.search(clean_q, filter="playlists")
            if res:
                data = yt.get_playlist(res[0]['playlistId'], limit=50)
                tracks = data.get("tracks", [])
                if tracks:
                    set_queue(tracks[1:], f"Playlist: {data['title']}")
                    res_s = {"videoId": tracks[0]['videoId'], "title": tracks[0]['title'], "artist": tracks[0]['artists'][0]['name'] if tracks[0].get('artists') else "Unknown"}
                    currently_playing_id = res_s['videoId']; played_history.insert(0, res_s); return res_s

        # 7. MODO CANCIÓN / SIGUIENTE (Por defecto)
        if not clean_q or any(w in clean_q for w in ["siguiente", "next", "otra", "cambia"]):
            if current_queue:
                song = current_queue.pop(0)
                played_history.insert(0, song); currently_playing_id = song['videoId']; return song
            clean_q = "pop hits"

        results = yt.search(clean_q, filter="songs")
        if results:
            song = next((r for r in results if r['artists'][0]['name'].lower() not in [a.lower() for a in disliked_artists] if r.get('artists')), results[0])
            currently_playing_id = song['videoId']
            try:
                radio = yt.get_watch_playlist(videoId=song['videoId'], limit=20)
                set_queue(radio.get("tracks", []), f"Mix: {song['title']}")
            except: pass
            played_history.insert(0, song)
            return {"videoId": song['videoId'], "title": song['title'], "artist": song['artists'][0]['name'] if song.get('artists') else "Unknown"}
            
        return {"error": "No results"}
    except Exception as e: return {"error": str(e)}

@app.post("/queue/remove/{video_id}")
def remove_from_queue(video_id: str):
    global current_queue
    current_queue = [s for s in current_queue if s['videoId'] != video_id]
    return {"status": "removed"}

@app.post("/queue/move/{video_id}")
def move_in_queue(video_id: str, to_index: int = Query(...)):
    global current_queue
    song = next((s for s in current_queue if s['videoId'] == video_id), None)
    if song:
        current_queue = [s for s in current_queue if s['videoId'] != video_id]
        current_queue.insert(to_index, song)
        return {"status": "moved"}
    return {"error": "No encontrada"}

@app.post("/like/{video_id}")
def handle_like(video_id: str, artist: str, current_title: Optional[str] = Query(None)):
    global currently_playing_id, currently_playing_title
    currently_playing_id = video_id; currently_playing_title = current_title or ""
    try:
        yt = get_yt()
        # LIKE REAL EN YOUTUBE
        yt.rate_song(video_id, 'LIKE')
        
        radio = yt.get_watch_playlist(videoId=video_id, limit=15)
        set_queue(radio.get("tracks", []), f"Basado en {artist}", clear=False)
        return {"status": "liked"}
    except: return {"error": "Error"}

@app.get("/history")
def get_history_list(limit: int = 20):
    return played_history[:limit]

@app.post("/dislike/{video_id}")
def handle_dislike(video_id: str, artist: str):
    global current_queue, disliked_artists, current_source
    disliked_artists.add(artist)
    current_queue = [] 
    current_source = None
    
    try:
        yt = get_yt()
        # DISLIKE REAL EN YOUTUBE
        yt.rate_song(video_id, 'DISLIKE')
    except: pass

    # Intentar rellenar la cola con favoritos/historial dinámico
    success = get_personal_mix()
    
    # Si no hay mix personal (invitado), preparamos una búsqueda de algo "random" pero popular
    if not success:
        yt = get_yt()
        fallback_results = yt.search("top hits 2024", filter="songs")
        if fallback_results:
            set_queue(fallback_results, "Mix General (Invitado)")
    
    return {"status": "disliked", "has_queue": len(current_queue) > 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
