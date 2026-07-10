FROM nginx:alpine

ENV BACKEND_UPSTREAM=backend:3000
ENV BACKEND_RESOLVER=127.0.0.11

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
