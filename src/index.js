var sqlite = require('node-spatialite');
var path = require('path');
var fs = require('fs');
var os = require('os');
var request = require('request');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var http = require('http').Server(app);
var port = process.env.PORT || 3001;

var dbFilename = 'ContextMassing2013_wgs84_v3.sqlite';
var dbRemoteFileUrl = 'http://amitudronesspatial.blob.core.windows.net/spatialdb/ContextMassing2013_wgs84_v3.sqlite';
var db;
var isDbReady = false;

// open db file
openDb(function(err){
    if (err) return console.error('error opening db:', err);
});

app.use(bodyParser.json());

// body: {  "droneHeight": 203,
//          "safetyDistanceHeight": 10,
//          "safetyDistanceSides": 330,
//          "buffer": 500,
//          "lineRoute": [[-8848015, 5425525], [-8845603, 5426088], [-8845543, 5425149]],
//          "useSpatialIndex": true,
//          "debug": true
//}
app.post('/obstacles', function(req, res){

    if (!isDbReady) return res.end('db is not ready... try again in a few seconds');
    return getObstacles(req.body, function(err, result) {
        if(err) return res.end(err.message);
        return res.json(result);
    });
});

app.use(function(req, res){
    var sampleBody = {  "droneHeight": 203,
        "safetyDistanceHeight": 10,
        "safetyDistanceSides": 330,
        "buffer": 500,
        "lineRoute": [[-8848015, 5425525], [-8845603, 5426088], [-8845543, 5425149]],
        "useSpatialIndex": true,
        "debug": true
    };

    return res.end('use POST /obstacles REST API with the following body example: \n\n ' + JSON.stringify(sampleBody, true, 2));
});

http.listen(port, function(err){
    if (err) return console.error(process.pid, 'error listening on port', port, err);
    console.log('listening on port', port);
});

// open db file
function openDb(cb) {

    var tmpDbPath = path.join(os.tmpdir(), dbFilename);
    return copyDbFile(tmpDbPath, function(err) {
        if (err) {
            console.error('error copying file', err);
            return cb(err);
        }

        console.log('opening', tmpDbPath);

        db = new sqlite.Database(tmpDbPath, function(err) {
            if (err) {
                console.error('error opening db file:', dbPath, err);
                return cb(err);
            }
            console.log('db opened successfully');
            //for(var api in db) console.log(api);

            console.log('initializing spatialite');
            db.spatialite(function(err) {
                if(err) {
                    console.error('error initializing spatialite:', dbPath, err);
                    return cb(err);
                }
                console.log('spatialite initialized successfully');
                isDbReady = true;

                return cb();
            });
        });
    });
}


// copy db file from remote url
function copyDbFile(filePath, cb) {

    console.log('checking db file', filePath);
    if (!fs.existsSync(filePath)) {
        console.info('db file not exists, downloading from', dbRemoteFileUrl);
        return request(dbRemoteFileUrl).pipe(fs.createWriteStream(filePath))
            .on('error', function(err){
                console.error('error copying file from', dbRemoteFileUrl, 'to', filePath, err);
                return cb(err);
            })
            .on('close', function() {
                console.log('file copied locally:', filePath);
                return cb()
            }
        );
    }

    console.log('db file exists', filePath);
    return cb();
}

// body: {  "droneHeight": 203,
//          "safetyDistanceHeight": 10,
//          "safetyDistanceSides": 330,
//          "buffer": 500,
//          "lineRoute": [[-8848015, 5425525], [-8845603, 5426088], [-8845543, 5425149]],
//          "useSpatialIndex": true,
//          "debug": true
//}
function getQuery(params) {

    var droneHeight = params.droneHeight || 200;
    var safetyDistanceHeight = params.safetyDistanceHeight || 10;
    var safeDistance = params.safetyDistanceSides || 2; // the distance considered to be safe when flying next to an object
    var buffer = params.buffer || 500; // the extra space to fetch buildings to
    var lineRoute = params.lineRoute || [[-8848015, 5425525], [-8845603, 5426088], [-8845543, 5425149]];
    var useSpatialIndex = !(params.useSpatialIndex === false);

    var geometryLine = "GeometryFromText('LINESTRING(";
    lineRoute.forEach(function(point, i){
        geometryLine += point[0] + ' ' + point[1];
        if ( i < lineRoute.length - 1)
            geometryLine += ', ';
    });
    geometryLine += ")')";

    var query = "\
    SELECT c.OGC_FID AS id, c.elevation as Z, X(Centroid(c.Geometry)) AS centerX, Y(Centroid(c.Geometry)) AS centerY \
    FROM \
        (SELECT vt.*, \
                MbrMinX(vt.areaEnvelope) AS minX, \
                MbrMaxX(vt.areaEnvelope) AS maxX, \
                MbrMinY(vt.areaEnvelope) AS minY, \
                MbrMaxY(vt.areaEnvelope) AS maxY  \
         FROM \
            (SELECT internal.geo AS geo, \
                    Envelope(Buffer(Envelope(internal.geo), "+ buffer +")) AS areaEnvelope, \
                    SimplifyPreserveTopology(Buffer(internal.geo, " + safeDistance + "), 10) as simplifiedTunnelGeo \
             FROM (SELECT "+geometryLine+" AS geo) internal \
            ) vt \
        ) calc \
    JOIN \
    contextmassing2013_wgs84_v3 c \
    ON ";

    if (useSpatialIndex) {
        query += " \
        c.OGC_FID IN \
            ( \
                SELECT pkid \
                FROM idx_contextmassing2013_wgs84_v3_GEOMETRY \
                WHERE \
                        (xmin >= calc.minX AND xmin <= calc.maxX AND ymin >= calc.minY AND ymin <= calc.maxY) OR \
                        (xmin >= calc.minX AND xmin <= calc.maxX AND ymax >= calc.minY AND ymax <= calc.maxY) OR \
                        (xmax >= calc.minX AND xmax <= calc.maxX AND ymin >= calc.minY AND ymin <= calc.maxY) OR \
                        (xmax >= calc.minX AND xmax <= calc.maxX AND ymax >= calc.minY AND ymax <= calc.maxY) \
            ) \
        AND ";
    }

    query += " \
        c.elevation > " + (droneHeight - safetyDistanceHeight) +" \
        AND Overlaps(calc.simplifiedTunnelGeo, c.Geometry) > 0 \
    LIMIT 10;";

    return query;
}

// get intersecting obstacles from db
function getObstacles(params, cb) {

    console.log('get obstacles called:', params);
    var query = getQuery(params);
    var debug = params.debug;

    console.log('running query', query);
    var startTime = new Date().getTime();

    var res = {
        obstacles: []
    };

    if (debug) {
        res.debugInfo = {
            request: params,
            query: query
        }
    }

    db.each(query,
        function(err, row) {
            if (err) {
                console.error('error running query', query, err);
                return cb(err);
            }
            console.log('result:', row);
            res.obstacles.push(row);
        },
        function(err, count) {
            if (err) {
                console.error('error running query complete handler', err);
                return cb(err);
            }

            if(debug) {
                res.debugInfo.duration = (new Date().getTime() - startTime);
            }

            return cb(null, res);
        }
    );
}
