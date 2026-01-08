# Use Nginx to serve static files
FROM nginx:stable-alpine

# 1. Copy your configuration
COPY default.conf /etc/nginx/conf.d/default.conf

# 2. Copy your static files from the 'public' folder 
# into the folder Nginx uses to serve websites
COPY ./public /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]