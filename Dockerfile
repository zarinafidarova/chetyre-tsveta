FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM golang:1.24-alpine AS server
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -o /server .

FROM alpine:3.20
WORKDIR /app
COPY --from=server /server ./server
COPY --from=web /web/dist ./web/dist
ENV PORT=8080
EXPOSE 8080
CMD ["./server"]
