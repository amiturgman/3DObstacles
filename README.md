# 3D Obstacles Modeling for drones' Sense&Avoid using Node.js and Spatialite

This repository contains the source files for the example I'm talking about in this [blog post](http://TODO).

This is a sample of how to use Node.js and Spatialite for modeling and querying 3D objects in space, to be used as part of drones' routing mechanism.

![3D Obstacles Modeling for drones](https://github.com/amiturgman/3dobstacles/raw/master/img/3DObstacles.png "3D Obstacles Modeling for drones")

The following is an example of how to call the `/obstacles` REST API:
![Query Sample](https://github.com/amiturgman/3dobstacles/raw/master/img/query_sample.png "3D Obstacles Modeling for drones")

#Useage

    git clone https://github.com/amiturgman/3dobstacles.git
    cd spatial
    npm install
    node index.js

# Note

If you're running on Windows, you might have issues compiling the node-spatialite module.
In such case, please follow this procedure:

    git clone https://github.com/amiturgman/node-spatialite.git
    cd node-spatialite
    git submodule init
    git submodule update
    node-gyp rebuild --msvs_version=2013

Then, copy the `node-spatialite` folder to the `node_modules` folder of your Node.js project.

# License
[MIT](LICENSE)
