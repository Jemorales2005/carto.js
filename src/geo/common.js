
/*
 *  common functions for cartodb connector
 */

function CartoDBLayerCommon() {
  
}

CartoDBLayerCommon.prototype = {

  // the way to show/hidelayer is to set opacity
  // removing the interactivty at the same time
  show: function() {
    if (this.options.visible) {
      return;
    }
    this.options.visible = true;
    this.setOpacity(this.options.previous_opacity);
    delete this.options.previous_opacity;
    this.setInteraction(true);
  },

  hide: function() {
    if (!this.options.visible) {
      return;
    }
    this.options.previous_opacity = this.options.opacity;
    this.setOpacity(0);
    this.setInteraction(false);

    this.options.visible = false;
  },

  /**
   * Check if CartoDB logo already exists
   */
  _isWadusAdded: function(container, className) {
    // Check if any cartodb-logo exists within container
    var a = [];
    var re = new RegExp('\\b' + className + '\\b');
    var els = container.getElementsByTagName("*");
    for(var i=0,j=els.length; i<j; i++)
      if(re.test(els[i].className))a.push(els[i]);

    return a.length > 0;
  },

  /**
   *  Check if browser supports retina images
   */
  _isRetinaBrowser: function() {
    return  ('devicePixelRatio' in window && window.devicePixelRatio > 1) ||
            ('matchMedia' in window && window.matchMedia('(min-resolution:144dpi)') &&
            window.matchMedia('(min-resolution:144dpi)').matches);
  },

  /**
   * Add Cartodb logo
   * It needs a position, timeout if it is needed and the container where add it
   */
  _addWadus: function(position, timeout, container) {
    if (this.options.cartodb_logo !== false && !this._isWadusAdded(container, 'cartodb-logo')) {
      var cartodb_link = document.createElement("div");
      var is_retina = this._isRetinaBrowser();
      cartodb_link.setAttribute('class','cartodb-logo');
      setTimeout(function() {
        cartodb_link.setAttribute('style',"position:absolute; bottom:0; left:0; display:block; border:none; z-index:1000000;");
        var protocol = location.protocol.indexOf('https') === -1 ? 'http': 'https';
        cartodb_link.innerHTML = "<a href='http://www.cartodb.com' target='_blank'><img width='71' height='29' src='" + protocol + "://cartodb.s3.amazonaws.com/static/new_logo" + (is_retina ? '@2x' : '') + ".png' style='position:absolute; bottom:" + 
          ( position.bottom || 0 ) + "px; left:" + ( position.left || 0 ) + "px; display:block; width:71px!important; height:29px!important; border:none; outline:none;' alt='CartoDB' title='CartoDB' />";
        container.appendChild(cartodb_link);
      },( timeout || 0 ));
    }
  },

  /**
   * Returns if the layer is visible or not
   */
  isVisible: function() {
    return this.options.visible
  },

  /**
   * Active or desactive interaction
   * @params enable {Number} layer number
   * @params layer {Boolean} Choose if wants interaction or not
   */
  setInteraction: function(layer, b) {
    // shift arguments to maintain caompatibility
    if(b == undefined) {
      b = layer;
      layer = 0;
    }
    var self = this;
    var layerInteraction;
    this.interactionEnabled[layer] = b;
    if(!b) {
      layerInteraction = this.interaction[layer];
      if(layerInteraction) {
        layerInteraction.remove();
        this.interaction[layer] = null;
      }
    } else {
      this.getTileJSON(layer, function(tilejson) {
        if(!tilejson) {
          //TODO: check errors
          return;
        }
        layerInteraction = self.interaction[layer];
        if(layerInteraction) {
          layerInteraction.remove();
        }
        // check again, it could be changed while the request arrives
        if(self.interactionEnabled[layer]) {
          self.interaction[layer] = self.interactionClass()
            .map(self.options.map)
            .tilejson(tilejson)
            .on('on', function(o) {
              o.layer = layer;
              self._manageOnEvents(self.options.map, o);
            })
            .on('off', function(o) {
              self._manageOffEvents();
            });
        }
      });
    }
    return this;
  },

  setOptions: function (opts) {

    if (typeof opts != "object" || opts.length) {
      throw new Error(opts + ' options has to be an object');
    }

    _.extend(this.options, opts);

    var opts = this.options;

    this.options.query = this.options.query || "select * from " + this.options.table_name;
    if(this.options.query_wrapper) {
      this.options.query = _.template(this.options.query_wrapper)({ sql: this.options.query });
    }

    this.setSilent(true);
    opts.interaction && this.setInteraction(opts.interaction);
    opts.opacity && this.setOpacity(opts.opacity);
    opts.query && this.setQuery(opts.query.replace(/\{\{table_name\}\}/g, this.options.table_name));
    opts.tile_style && this.setCartoCSS(opts.tile_style.replace(new RegExp( opts.table_name, "g"), "layer0"));
    opts.cartocss && this.setCartoCSS(opts.cartocss);
    opts.interactivity && this.setInteractivity(opts.interactivity);
    this.setSilent(false);
    this._definitionUpdated();

  },

  _getLayerDefinition: function() {
    // set params
    var params = {};
    var opts = this.options;
    var sql, cartocss, cartocss_version;
    sql = opts.query || "select * from " + opts.table_name;

    if(opts.query_wrapper) {
      sql = _.template(opts.query_wrapper)({ sql: sql });
    }

    cartocss = opts.tile_style;
    cartocss_version = opts.cartocss_version || '2.1.0';

    // extra_params?
    for (var _param in opts.extra_params) {
      var v = opts.extra_params[_param]
      params[_param] = v.replace ? v.replace(/\{\{table_name\}\}/g, opts.table_name): v;
    }
    sql = sql.replace(/\{\{table_name\}\}/g, opts.table_name);
    cartocss = cartocss.replace(/\{\{table_name\}\}/g, opts.table_name);
    cartocss = cartocss.replace(new RegExp( opts.table_name, "g"), "layer0");


    return {
      sql: sql,
      cartocss: cartocss,
      cartocss_version: cartocss_version,
      params: params,
      interactivity: opts.interactivity
    }

  },

  //
  // param ext tile extension, i.e png, json
  // 
  /*
  _tilesUrl: function(ext, subdomain) {
    var opts = this.options;
    ext = ext || 'png';
    var cartodb_url = this._host(subdomain) + '/tiles/' + opts.table_name + '/{z}/{x}/{y}.' + ext + '?';

    // set params
    var params = {};
    if(opts.query) {
      params.sql = opts.query;
    }

    if(opts.query_wrapper) {
      params.sql = _.template(opts.query_wrapper)({ sql: params.sql || "select * from " + opts.table_name });
    }

    if(opts.tile_style && !opts.use_server_style) {
      params.style = opts.tile_style;
    }
    // style_version is only valid when tile_style is present
    if(opts.tile_style && opts.style_version && !opts.use_server_style) {
      params.style_version = opts.style_version;
    }

    if(ext === 'grid.json') {
      if(opts.interactivity) {
        params.interactivity = opts.interactivity.replace(/ /g, '');
      }
    }

    // extra_params?
    for (_param in opts.extra_params) {
       params[_param] = opts.extra_params[_param];
    }

    var url_params = [];
    for(var k in params) {
      var p = params[k];
      if(p) {
        var q = encodeURIComponent(
          p.replace ? 
            p.replace(/\{\{table_name\}\}/g, opts.table_name):
            p
        );
        q = q.replace(/%7Bx%7D/g,"{x}").replace(/%7By%7D/g,"{y}").replace(/%7Bz%7D/g,"{z}");
        url_params.push(k + "=" + q);
      }
    }
    cartodb_url += url_params.join('&');

    return cartodb_url;
  },


  _tileJSON: function () {
    var grids = [];
    var tiles = [];
    var subdomains = this.options.subdomains || ['0', '1', '2', '3'];
    if(this.isHttps()) {
      subdomains = [null]; // no subdomain
    } 

    // use subdomains
    for(var i = 0; i < subdomains.length; ++i) {
      var s = subdomains[i]
      grids.push(this._tilesUrl('grid.json', s));
      tiles.push(this._tilesUrl('png', s));
    }
    return {
        tilejson: '2.0.0',
        scheme: 'xyz',
        grids: grids,
        tiles: tiles,
        formatter: function(options, data) { return data; }
    };
  },
  */


  error: function(e) {
    console.log(e.error);
  },

  tilesOk: function() {
  },

  _clearInteraction: function() {
    for(var i in this.interactionEnabled) {
      if(this.interactionEnabled[i]) {
        this.setInteraction(i, false);
      }
    }
  },

  _reloadInteraction: function() {
    for(var i in this.interactionEnabled) {
      if(this.interactionEnabled[i]) {
        this.setInteraction(i, false);
        this.setInteraction(i, true);
      }
    }
  },

  /**
   *  Check the tiles
   */
  _checkTiles: function() {
    var xyz = {z: 4, x: 6, y: 6}
      , self = this
      , img = new Image()
      , urls = this._tileJSON()

    getTiles(function(urls) {

      var grid_url = urls.tiles[0]
          .replace(/\{z\}/g,xyz.z)
          .replace(/\{x\}/g,xyz.x)
          .replace(/\{y\}/g,xyz.y);

      this.options.ajax({
        method: "get",
        url: grid_url,
        crossDomain: true,
        success: function() {
          self.tilesOk();
          clearTimeout(timeout)
        },
        error: function(xhr, msg, data) {
          clearTimeout(timeout);
          self.error(xhr.responseText && JSON.parse(xhr.responseText));
        }
      });
    });

    var timeout = setTimeout(function(){
      clearTimeout(timeout);
      self.error("tile timeout");
    }, 30000);

  }


};

