# doselect_challenge
A simple express RestAPI server for image/gif storage and serving.

> Uses [lepton](https://github.com/dropbox/lepton) for image compression.

## Setting Up
1. Setting lepton (it should work by default, but if needed to build again)
  ```
  cd lepton
  ./autogen.sh
  ./configure
  make
  make check
  ```
2. Installing node packages - Run ```npm install```
3. Setting up DB (you should have MySQL on system)
  * Create a database
  * Change the parameters in db.js
  * Run ```node initialise.js```
4. Run server ```node --harmony_array_includes app.js```
