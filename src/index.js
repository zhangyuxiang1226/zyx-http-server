let http = require('http');
let util = require('util');
let url = require('url');
let zlib = require('zlib');
let fs = require('fs');
let path = require('path');
let querystring = require('querystring');
let ejs = require('ejs');
let template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
let chalk = require('chalk');
let mime = require('mime');

let debug = require('debug')('hello');
let config = require('./config'); // port host dir

let stat = util.promisify(fs.stat);
let readdir = util.promisify(fs.readdir);

class Server {
    constructor(command) {
        this.config = {...config,...command} // config和命令行的内容展示
        this.template = template;
    }

    async handleRequest(req, res) {
        let {dir} = this.config;  // 用于和请求路径拼接
        let {pathname} = url.parse(req.url);
        // 请求的是favicon则直接返回
        if (pathname === '/favicon.ico') {
            return res.end();
        }
        pathname = decodeURIComponent(pathname);
        let p = path.join(dir, pathname);
        // 读取p的状态判断是文件夹还是文件
        try {
            let statObj = await stat(p);
            // 如果是目录 吧目录下所有内容渲染回页面
            if (statObj.isDirectory()) {
                res.setHeader('Content-Type', 'text/html;charset=utf8');
                let dirs = await readdir(p);
                // 预留生成链接的 name 和 href
                dirs = dirs.map(item => ({
                    name: item,
                    href: path.join(pathname, item)
                }));

                let str = ejs.render(this.template, {
                    name: `Index of ${pathname}`,
                    arr: dirs
                });
                res.end(str);
            }
            else {
                this.sendFile(req, res, statObj, p)
            }
        }
        catch(e) {
            debug(e);
            this.sendError(req, res)
        }
    }
    /**
     * 处理用户缓存 返回true或false
     * @param {*} req 请求 
     * @param {*} res 响应
     * @param {*} statObj 文件状态
     * @param {*} p 路径
     */
    cache(req, res, statObj, p ) {
        // 设置缓存头
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Expires', new Date(Date.now() + 10 * 1000).getTime());
        // 设置etag和上次最新修改时间
        let eTag = statObj.ctime.getTime() + '-' + statObj.size;
        let lastModified = statObj.ctime.getTime();
        // 传给客户端
        res.setHeader('Etag', eTag);
        res.setHeader('Last-Modified', lastModified);
        // 客户端把上次设置的带过来
        let ifNoneMatch = req.headers['if-none-match'];
        let ifModifiedSince = req.headers['if-modified-since'];
        if (eTag !== ifNoneMatch && lastModified !== ifModifiedSince) {
            return false;
        }

        return true;
    }
    // 是否压缩
    gzip(req, res, statObj, p) {
        let encoding = req.headers['accept-encoding'];
        if (encoding) {
            // gzip
            if (encoding.match(/\bgzip\b/)) {
                res.setHeader('Content-Encoding', 'gzip');
                return zlib.createGzip();
            }
            // deflate
            if (encoding.match(/\bdeflate\b/)) {
                res.setHeader('Content-Encoding', 'deflate');
                return zlib.createDeflate();
            }
            return false;
        }
        else {
            return false;
        }
    }
    // 范围请求
    range(req, res, statObj, p) {
        let range = req.headers['range'];
        // 有范围请求时返回读流，断点续传
        if (range) {
            let [, start, end] = range.match(/bytes=(\d*)-(\d*)/);
            start = start ? Number(start) : 0;
            end = end ? Number(end) : statObj.size - 1;
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${statObj.size - 1}`);
            fs.createReadStream(p, {start, end}).pipe(res);
        }
        else {
            return false;
        }
    }
    sendFile(req, res, statObj, p) {
        if (this.cache(req, res, statObj, p)) {
            res.statusCode = 304;
            return res.end();
        }
        // 是范围请求就忽略
        if (this.range(req, res, statObj, p)) return;
        res.setHeader('Content-Type', mime.getType(p) + ';charset=utf8');
        let transform = this.gzip(req, res, statObj, p);
        if (transform) {
            return fs.createReadStream(p).pipe(transform).pipe(res);
        }
        fs.createReadStream(p).pipe(res);
    }
    sendError(req, res){
        res.statusCode = 404;
        res.end(`404 Not Found`);
        this.start();
    }
    start() {
        let server = http.createServer(this.handleRequest.bind(this));
        server.listen(this.config.port, this.config.host, ()=> {
            console.log(`server start http://${this.config.host}:${chalk.green(this.config.port)}`);
        });
    }
}

module.exports = Server;