var NoflandSpine = {
    jsPath: document.scripts[document.scripts.length-1].src.substring(0,document.scripts[document.scripts.length-1].src.lastIndexOf("/")+1),
    skels: undefined,
    canvas: undefined,
    gl: undefined,
    shader: undefined,
    batcher: undefined,
    mvp: new spine.webgl.Matrix4(),
    skeletonRenderer: undefined,
    assetManager: undefined,
    debugRenderer: undefined,
    debugShader: undefined,
    shapes: undefined,
    lastFrameTime: undefined,
    skeletons: {},
    activeClassify: undefined,
    activeSkeleton: undefined,
    init: () => {
        // Setup canvas and WebGL context. We pass alpha: false to canvas.getContext() so we don't use premultiplied alpha when
        // loading textures. That is handled separately by PolygonBatcher.
        NoflandSpine.canvas = document.getElementById("canvas");
        NoflandSpine.canvas.width = window.innerWidth;
        NoflandSpine.canvas.height = window.innerHeight;
        var config = { alpha: true };
        NoflandSpine.gl = NoflandSpine.canvas.getContext("webgl", config) || NoflandSpine.canvas.getContext("experimental-webgl", config);
        if (!NoflandSpine.gl) {
            alert('WebGL is unavailable.');
            return;
        }

        // Create a simple shader, mesh, model-view-projection matrix, SkeletonRenderer, and AssetManager.
        NoflandSpine.shader = spine.webgl.Shader.newTwoColoredTextured(NoflandSpine.gl);
        NoflandSpine.batcher = new spine.webgl.PolygonBatcher(NoflandSpine.gl);
        NoflandSpine.mvp.ortho2d(0, 0, NoflandSpine.canvas.width - 1, NoflandSpine.canvas.height - 1);
        NoflandSpine.skeletonRenderer = new spine.webgl.SkeletonRenderer(NoflandSpine.gl);
        NoflandSpine.assetManager = new spine.webgl.AssetManager(NoflandSpine.gl);

        // Create a debug renderer and the ShapeRenderer it needs to render lines.
        NoflandSpine.debugRenderer = new spine.webgl.SkeletonDebugRenderer(NoflandSpine.gl);
        NoflandSpine.debugRenderer.drawRegionAttachments = true;
        NoflandSpine.debugRenderer.drawBoundingBoxes = true;
        NoflandSpine.debugRenderer.drawMeshHull = true;
        NoflandSpine.debugRenderer.drawMeshTriangles = true;
        NoflandSpine.debugRenderer.drawPaths = true;
        NoflandSpine.debugShader = spine.webgl.Shader.newColored(NoflandSpine.gl);
        NoflandSpine.shapes = new spine.webgl.ShapeRenderer(NoflandSpine.gl);
    },
    load: () => {
        // Wait until the AssetManager has loaded all resources, then load the skeletons.
        if (NoflandSpine.assetManager.isLoadingComplete()) {
            if (!NoflandSpine.skeletons[NoflandSpine.activeSkeleton]) {
                var skel = NoflandSpine.skels[NoflandSpine.activeSkeleton];
                NoflandSpine.skeletons[NoflandSpine.activeSkeleton] = NoflandSpine.loadSkeleton(skel, "idle", true, "default");
            }
            NoflandSpine.setupUI();
            NoflandSpine.lastFrameTime = Date.now() / 1000;
            $("#console select,input").prop("disabled", false);
            requestAnimationFrame(NoflandSpine.render); // Loading is done, call render every frame.
        } else {
            requestAnimationFrame(NoflandSpine.load);
        }
    },
    loadSkeleton: (skel, initialAnimation, premultipliedAlpha, skin) => {
        if (skin === undefined) skin = "default";

        // Load the texture atlas using name.atlas from the AssetManager.
        var atlas = NoflandSpine.assetManager.get(NoflandSpine.jsPath+`skels/${NoflandSpine.activeClassify}/${NoflandSpine.activeSkeleton}/0.atlas`);

        // Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
        var atlasLoader = new spine.AtlasAttachmentLoader(atlas);

        if (skel.type === "binary") {
            // Create a SkeletonBinary instance for parsing the .skel file.
            var skeletonSource = new spine.SkeletonBinary(atlasLoader);
        } else if (skel.type === "text") {
            // Create a SkeletonBinary instance for parsing the .json file.
            var skeletonSource = new spine.SkeletonJson(atlasLoader);
        }
        // Set the scale to apply during parsing, parse the file, and create a new skeleton.
        skeletonSource.scale = 1;
        var skeletonData = skeletonSource.readSkeletonData(NoflandSpine.assetManager.get(NoflandSpine.jsPath+`skels/${NoflandSpine.activeClassify}/${NoflandSpine.activeSkeleton}/0.${skel.ext}`));
        var skeleton = new spine.Skeleton(skeletonData);
        skeleton.setSkinByName(skin);
        var bounds = NoflandSpine.calculateSetupPoseBounds(skeleton);

        // Create an AnimationState, and set the initial animation in looping mode.
        var animationStateData = new spine.AnimationStateData(skeleton.data);
        var animationState = new spine.AnimationState(animationStateData);
        animationState.setAnimation(0, initialAnimation, true);
        // animationState.addListener({
        // 	start: function (track) {
        // 		console.log("Animation on track " + track.trackIndex + " started");
        // 	},
        // 	interrupt: function (track) {
        // 		console.log("Animation on track " + track.trackIndex + " interrupted");
        // 	},
        // 	end: function (track) {
        // 		console.log("Animation on track " + track.trackIndex + " ended");
        // 	},
        // 	disposed: function (track) {
        // 		console.log("Animation on track " + track.trackIndex + " disposed");
        // 	},
        // 	complete: function (track) {
        // 		console.log("Animation on track " + track.trackIndex + " completed");
        // 	},
        // 	event: function (track, event) {
        // 		console.log("Event on track " + track.trackIndex + ": " + JSON.stringify(event));
        // 	}
        // })

        // Pack everything up and return to caller.
        return { skeleton: skeleton, state: animationState, bounds: bounds, premultipliedAlpha: premultipliedAlpha };
    },
    calculateSetupPoseBounds: (skeleton) => {
        skeleton.setToSetupPose();
        skeleton.updateWorldTransform();
        var offset = new spine.Vector2();
        var size = new spine.Vector2();
        skeleton.getBounds(offset, size, []);
        return { offset: offset, size: size };
    },
    setupUI() {

        var setupAnimationUI = function () {
            var animationList = $("#animationList");
            animationList.empty();
            var skeleton = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].skeleton;
            var state = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].state;
            var activeAnimation = state.tracks[0].animation.name;
            for (var i = 0; i < skeleton.data.animations.length; i++) {
                var name = skeleton.data.animations[i].name;
                var option = $("<option></option>");
                option.attr("value", name).text(name);
                if (name === activeAnimation) option.attr("selected", "selected");
                animationList.append(option);
            }

            animationList.change(function () {
                var state = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].state;
                var skeleton = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].skeleton;
                var animationName = $("#animationList option:selected").text();
                skeleton.setToSetupPose();
                state.setAnimation(0, animationName, true);
            })
        }

        var setupSkinUI = function () {
            var skinList = $("#skinList");
            skinList.empty();
            var skeleton = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].skeleton;
            var activeSkin = skeleton.skin == null ? "default" : skeleton.skin.name;
            for (var i = 0; i < skeleton.data.skins.length; i++) {
                var name = skeleton.data.skins[i].name;
                var option = $("<option></option>");
                option.attr("value", name).text(name);
                if (name === activeSkin) option.attr("selected", "selected");
                skinList.append(option);
            }

            skinList.change(function () {
                var skeleton = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].skeleton;
                var skinName = $("#skinList option:selected").text();
                skeleton.setSkinByName(skinName);
                skeleton.setSlotsToSetupPose();
            })
        }


        setupAnimationUI();
        setupSkinUI();
    },
    render() {
        var now = Date.now() / 1000;
        var delta = now - NoflandSpine.lastFrameTime;
        NoflandSpine.lastFrameTime = now;

        // Update the MVP matrix to adjust for canvas size changes
        NoflandSpine.resize();

        NoflandSpine.gl.clearColor(0, 0, 0, 0);
        NoflandSpine.gl.clear(NoflandSpine.gl.COLOR_BUFFER_BIT);

        // Apply the animation state based on the delta time.
        var skeleton = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].skeleton;
        var state = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].state;
        var premultipliedAlpha = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].premultipliedAlpha;
        state.update(delta);
        state.apply(skeleton);
        skeleton.updateWorldTransform();

        // Bind the shader and set the texture and model-view-projection matrix.
        NoflandSpine.shader.bind();
        NoflandSpine.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
        NoflandSpine.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, NoflandSpine.mvp.values);

        // Start the batch and tell the SkeletonRenderer to render the active skeleton.
        NoflandSpine.batcher.begin(NoflandSpine.shader);

        NoflandSpine.skeletonRenderer.premultipliedAlpha = premultipliedAlpha;
        NoflandSpine.skeletonRenderer.draw(NoflandSpine.batcher, skeleton);
        NoflandSpine.batcher.end();

        NoflandSpine.shader.unbind();

        // Draw debug information.
        var debug = $('#debug').is(':checked');
        if (debug) {
            NoflandSpine.debugShader.bind();
            NoflandSpine.debugShader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, NoflandSpine.mvp.values);
            NoflandSpine.debugRenderer.premultipliedAlpha = premultipliedAlpha;
            NoflandSpine.shapes.begin(NoflandSpine.debugShader);
            NoflandSpine.debugRenderer.draw(NoflandSpine.shapes, skeleton);
            NoflandSpine.shapes.end();
            NoflandSpine.debugShader.unbind();
        }

        requestAnimationFrame(NoflandSpine.render);
    },
    resize() {
        var w = NoflandSpine.canvas.clientWidth;
        var h = NoflandSpine.canvas.clientHeight;
        if (NoflandSpine.canvas.width != w || NoflandSpine.canvas.height != h) {
            NoflandSpine.canvas.width = w;
            NoflandSpine.canvas.height = h;
        }

        // Calculations to center the skeleton in the canvas.
        var bounds = NoflandSpine.skeletons[NoflandSpine.activeSkeleton].bounds;
        var centerX = bounds.offset.x + bounds.size.x / 2;
        var centerY = bounds.offset.y + bounds.size.y / 2;
        var scaleX = bounds.size.x / NoflandSpine.canvas.width;
        var scaleY = bounds.size.y / NoflandSpine.canvas.height;
        var scale = Math.max(scaleX, scaleY) * 1.2;
        if (scale < 1) scale = 1;
        var width = NoflandSpine.canvas.width * scale;
        var height = NoflandSpine.canvas.height * scale;

        NoflandSpine.mvp.ortho2d(centerX - width / 2, centerY - height / 2, width, height);
        NoflandSpine.gl.viewport(0, 0, NoflandSpine.canvas.width, NoflandSpine.canvas.height);
    },
    create: (skelName) => {
        var target;
        $.get(NoflandSpine.jsPath+'skels.json', dataType="json", success=(data) => {
            NoflandSpine.skels = data;
            var skeletonList = $("#skeletonList");

            var sorted = [];
            var sortmaps = {};
            if (skelName) { // 限定
                for (var id in NoflandSpine.skels) {
                    var skel = NoflandSpine.skels[id];
                    if (skel.alias === skelName){
                        sorted.push(skel.name);
                        sortmaps[skel.name] = id;
                    }
                }
            } else { // 全部
                for (var id in NoflandSpine.skels) {
                    var skel = NoflandSpine.skels[id];
                    sorted.push(skel.name);
                    sortmaps[skel.name] = id;
                }
            }
            sorted.sort(new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare);
            for (var i in sorted) {
                var name = sorted[i];
                var id = sortmaps[name];
                var option = $("<option></option>");
                option.attr("value", id).text(name);
                skeletonList.append(option);
            }

            skeletonList.change(() => {
                $("#console select,input").prop("disabled", true);
                NoflandSpine.activeSkeleton = skeletonList.val();
                // Tell AssetManager to load the resources for each skeleton, including the exported .skel file, the .atlas file and the .png
                // file for the atlas. We then wait until all resources are loaded in the load() method.
                if (!NoflandSpine.skeletons[NoflandSpine.activeSkeleton]) {
                    var skel = NoflandSpine.skels[NoflandSpine.activeSkeleton];
                    NoflandSpine.activeClassify = skel.classify;
                    if (skel.type === "binary")
                        NoflandSpine.assetManager.loadBinary(NoflandSpine.jsPath+`skels/${NoflandSpine.activeClassify}/${NoflandSpine.activeSkeleton}/0.${skel.ext}`);
                    else if (skel.type === "text")
                        NoflandSpine.assetManager.loadText(NoflandSpine.jsPath+`skels/${NoflandSpine.activeClassify}/${NoflandSpine.activeSkeleton}/0.${skel.ext}`);
                    NoflandSpine.assetManager.loadTextureAtlas(NoflandSpine.jsPath+`skels/${NoflandSpine.activeClassify}/${NoflandSpine.activeSkeleton}/0.atlas`);
                }
                requestAnimationFrame(NoflandSpine.load);
            })
            NoflandSpine.init();
            skeletonList.change();
        });
    }
}
