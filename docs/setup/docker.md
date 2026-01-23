# PiGallery2 Docker Installation

[Docker](https://www.docker.com/) with [docker-compose](https://docs.docker.com/compose/) is the **official and recommended** way of installing and running PiGallery2. 

It contains all necessary dependencies, auto-restarts on reboot, supports HTTPS, and is easy to upgrade.

## 0. Install Docker (recommended)
Official installation guide [here](https://docs.docker.com/install/), but this will most likely do the trick on a Raspberry Pi: 
```bash
curl -sSL https://get.docker.com | sh
``` 

## I. Docker Compose
It is recommended to use [docker-compose](https://docs.docker.com/compose/) to run PiGallery2.

### I.0 Install Docker Compose
Official installation guide [here](https://docs.docker.com/compose/install/), or try this:
```bash
sudo apt-get install libffi-dev libssl-dev
sudo apt-get install -y python3 python3-pip
sudo pip3 install docker-compose
``` 
Check success with `docker-compose --version`.

### I.1 Get docker-compose.yml file
Download [docker-compose/default/docker-compose.yml](https://github.com/bpatrik/pigallery2/blob/master/docker/docker-compose/default/docker-compose.yml) and 
[docker-compose/default/nginx.conf](https://github.com/bpatrik/pigallery2/blob/master/docker/docker-compose/default/nginx.conf).

Edit `docker-compose.yml` to point the volumes to your images and temp directories.
Edit `nginx.conf` to replace `yourdomain.com` with your domain address.

**Note**: Do not change the `image` and `tmp` paths in the `config.json` or UI; only use Docker `volume` settings.

### I.1.a Get SSL Certificate with Certbot
Install Certbot: https://certbot.eff.org/.
```bash
certbot certonly --standalone -d yourdomain.com
```

### I.1.b Start Docker Compose
```bash
docker-compose up -d
```
Go to `yourdomain.com` and log in with user: `admin` pass: `admin`.

## II. Without Docker Compose
```bash
docker run \
   -p 80:80 \
   -e NODE_ENV=production \
   -v <path to config>:/app/data/config \
   -v <path to db>:/app/data/db \
   -v <path to images>:/app/data/images \
   -v <path to temp>:/app/data/tmp \
   bpatrik/pigallery2:latest
```

## Contributing to Docker
See the [Docker Contribution Guide](../development/docker-contributing.md).
