package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// Адрес берётся из флага -addr, затем из HTTP_ADDR (так на сервере),
// затем из PORT (так на хостингах вроде Render), иначе :8080.
func listenAddr(flagAddr string) string {
	if flagAddr != "" {
		return flagAddr
	}
	if a := os.Getenv("HTTP_ADDR"); a != "" {
		return a
	}
	if p := os.Getenv("PORT"); p != "" {
		return ":" + p
	}
	return ":8080"
}

// sameOrigin не пускает WebSocket со страниц чужих сайтов.
// Запросы без Origin (не из браузера, например curl) пропускаем.
// ALLOWED_ORIGINS — дополнительные разрешённые хосты через запятую.
func sameOrigin(r *http.Request, extra []string) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return true
	}
	u, err := url.Parse(o)
	if err != nil {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	for _, h := range extra {
		if strings.EqualFold(u.Host, h) {
			return true
		}
	}
	return false
}

func main() {
	addr := flag.String("addr", "", "адрес сервера (по умолчанию HTTP_ADDR, затем :$PORT, затем :8080)")
	webDir := flag.String("web", "web/dist", "папка со сборкой фронтенда; на сервере статику отдаёт nginx")
	flag.Parse()
	listen := listenAddr(*addr)

	var extraOrigins []string
	for _, h := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if h = strings.TrimSpace(h); h != "" {
			extraOrigins = append(extraOrigins, h)
		}
	}

	hub := newHub()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if !sameOrigin(r, extraOrigins) {
			http.Error(w, "forbidden origin", http.StatusForbidden)
			return
		}
		ws, err := upgrade(w, r)
		if err != nil {
			return
		}
		serveClient(hub, ws)
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Write([]byte("ok"))
	})

	// Статика фронтенда для локального запуска; неизвестные пути отдают index.html.
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

	srv := &http.Server{
		Addr:              listen,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("Четыре цвета слушает %s", listen)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	// systemctl restart присылает SIGTERM: перестаём принимать новых и выходим.
	// Открытые WebSocket-соединения закрываются, клиенты сами переподключатся
	// к новому процессу. Столы живут в памяти, так что после перезапуска их нет.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Print("останавливаемся")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
