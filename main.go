package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

func main() {
	addr := flag.String("addr", "", "адрес сервера (по умолчанию :$PORT или :8080)")
	webDir := flag.String("web", "web/dist", "папка со сборкой фронтенда")
	flag.Parse()
	if *addr == "" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "8080"
		}
		*addr = ":" + port
	}

	hub := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws, err := upgrade(w, r)
		if err != nil {
			return
		}
		serveClient(hub, ws)
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })

	// Статика фронтенда; неизвестные пути отдают index.html.
	files := http.FileServer(http.Dir(*webDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(*webDir, filepath.Clean("/"+r.URL.Path))
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			index := filepath.Join(*webDir, "index.html")
			if _, err := os.Stat(index); err != nil {
				http.Error(w, "Фронтенд не собран: выполните npm run build в папке web", http.StatusNotFound)
				return
			}
			http.ServeFile(w, r, index)
			return
		}
		files.ServeHTTP(w, r)
	})

	log.Printf("Четыре цвета: http://localhost%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
