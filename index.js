const jsPath = document.scripts[document.scripts.length-1].src.substring(0,document.scripts[document.scripts.length-1].src.lastIndexOf("/")+1);

var fairys;

var canvas;
var gl;
var shader;
var batcher;
var mvp = new spine.webgl.Matrix4();
var skeletonRenderer;
var assetManager;

var debugRenderer;
var shapes;

var lastFrameTime;
var skeletons = {};
var activeSkeleton;
var swirlTime = 0;

function init() {
    // Setup canvas and WebGL context. We pass alpha: false to canvas.getContext() so we don't use premultiplied alpha when
    // loading textures. That is handled separately by PolygonBatcher.
    canvas = document.getElementById("canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var config = { alpha: true };
    gl = canvas.getContext("webgl", config) || canvas.getContext("experimental-webgl", config);
    if (!gl) {
        alert('WebGL is unavailable.');
        return;
    }

    // Create a simple shader, mesh, model-view-projection matrix, SkeletonRenderer, and AssetManager.
    shader = spine.webgl.Shader.newTwoColoredTextured(gl);
    batcher = new spine.webgl.PolygonBatcher(gl);
    mvp.ortho2d(0, 0, canvas.width - 1, canvas.height - 1);
    skeletonRenderer = new spine.webgl.SkeletonRenderer(gl);
    assetManager = new spine.webgl.AssetManager(gl);

    // Create a debug renderer and the ShapeRenderer it needs to render lines.
    debugRenderer = new spine.webgl.SkeletonDebugRenderer(gl);
    debugRenderer.drawRegionAttachments = true;
    debugRenderer.drawBoundingBoxes = true;
    debugRenderer.drawMeshHull = true;
    debugRenderer.drawMeshTriangles = true;
    debugRenderer.drawPaths = true;
    debugShader = spine.webgl.Shader.newColored(gl);
    shapes = new spine.webgl.ShapeRenderer(gl);
}

function load() {
    // Wait until the AssetManager has loaded all resources, then load the skeletons.
    if (assetManager.isLoadingComplete()) {
        if (!skeletons[activeSkeleton]) {
            fairy = fairys[activeSkeleton];
            skeletons[activeSkeleton] = loadSkeleton(fairy, "idle", true, "default");
        }
        setupUI();
        lastFrameTime = Date.now() / 1000;
        $("#console select,input").prop("disabled", false);
        requestAnimationFrame(render); // Loading is done, call render every frame.
    } else {
        requestAnimationFrame(load);
    }
}

function loadSkeleton(fairy, initialAnimation, premultipliedAlpha, skin) {
    if (skin === undefined) skin = "default";

    // Load the texture atlas using name.atlas from the AssetManager.
    var atlas = assetManager.get(jsPath+`skels/${activeSkeleton}/0.atlas`);

    // Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
    var atlasLoader = new spine.AtlasAttachmentLoader(atlas);

    if (fairy.type === "binary") {
        // Create a SkeletonBinary instance for parsing the .skel file.
        var skeletonSource = new spine.SkeletonBinary(atlasLoader);
    } else if (fairy.type === "text") {
        // Create a SkeletonBinary instance for parsing the .json file.
        var skeletonSource = new spine.SkeletonJson(atlasLoader);
    }
    // Set the scale to apply during parsing, parse the file, and create a new skeleton.
    skeletonSource.scale = 1;
    var skeletonData = skeletonSource.readSkeletonData(assetManager.get(jsPath+`skels/${activeSkeleton}/0.${fairy.ext}`));
    var skeleton = new spine.Skeleton(skeletonData);
    skeleton.setSkinByName(skin);
    var bounds = calculateSetupPoseBounds(skeleton);

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
}

function calculateSetupPoseBounds(skeleton) {
    skeleton.setToSetupPose();
    skeleton.updateWorldTransform();
    var offset = new spine.Vector2();
    var size = new spine.Vector2();
    skeleton.getBounds(offset, size, []);
    return { offset: offset, size: size };
}

function setupUI() {

    var setupAnimationUI = function () {
        var animationList = $("#animationList");
        animationList.empty();
        var skeleton = skeletons[activeSkeleton].skeleton;
        var state = skeletons[activeSkeleton].state;
        var activeAnimation = state.tracks[0].animation.name;
        for (var i = 0; i < skeleton.data.animations.length; i++) {
            var name = skeleton.data.animations[i].name;
            var option = $("<option></option>");
            option.attr("value", name).text(name);
            if (name === activeAnimation) option.attr("selected", "selected");
            animationList.append(option);
        }

        animationList.change(function () {
            var state = skeletons[activeSkeleton].state;
            var skeleton = skeletons[activeSkeleton].skeleton;
            var animationName = $("#animationList option:selected").text();
            skeleton.setToSetupPose();
            state.setAnimation(0, animationName, true);
        })
    }

    var setupSkinUI = function () {
        var skinList = $("#skinList");
        skinList.empty();
        var skeleton = skeletons[activeSkeleton].skeleton;
        var activeSkin = skeleton.skin == null ? "default" : skeleton.skin.name;
        for (var i = 0; i < skeleton.data.skins.length; i++) {
            var name = skeleton.data.skins[i].name;
            var option = $("<option></option>");
            option.attr("value", name).text(name);
            if (name === activeSkin) option.attr("selected", "selected");
            skinList.append(option);
        }

        skinList.change(function () {
            var skeleton = skeletons[activeSkeleton].skeleton;
            var skinName = $("#skinList option:selected").text();
            skeleton.setSkinByName(skinName);
            skeleton.setSlotsToSetupPose();
        })
    }


    setupAnimationUI();
    setupSkinUI();
}

function render() {
    var now = Date.now() / 1000;
    var delta = now - lastFrameTime;
    lastFrameTime = now;

    // Update the MVP matrix to adjust for canvas size changes
    resize();

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Apply the animation state based on the delta time.
    var skeleton = skeletons[activeSkeleton].skeleton;
    var state = skeletons[activeSkeleton].state;
    var premultipliedAlpha = skeletons[activeSkeleton].premultipliedAlpha;
    state.update(delta);
    state.apply(skeleton);
    skeleton.updateWorldTransform();

    // Bind the shader and set the texture and model-view-projection matrix.
    shader.bind();
    shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
    shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, mvp.values);

    // Start the batch and tell the SkeletonRenderer to render the active skeleton.
    batcher.begin(shader);

    skeletonRenderer.premultipliedAlpha = premultipliedAlpha;
    skeletonRenderer.draw(batcher, skeleton);
    batcher.end();

    shader.unbind();

    // Draw debug information.
    var debug = $('#debug').is(':checked');
    if (debug) {
        debugShader.bind();
        debugShader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, mvp.values);
        debugRenderer.premultipliedAlpha = premultipliedAlpha;
        shapes.begin(debugShader);
        debugRenderer.draw(shapes, skeleton);
        shapes.end();
        debugShader.unbind();
    }

    requestAnimationFrame(render);
}

function resize() {
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (canvas.width != w || canvas.height != h) {
        canvas.width = w;
        canvas.height = h;
    }

    // Calculations to center the skeleton in the canvas.
    var bounds = skeletons[activeSkeleton].bounds;
    var centerX = bounds.offset.x + bounds.size.x / 2;
    var centerY = bounds.offset.y + bounds.size.y / 2;
    var scaleX = bounds.size.x / canvas.width;
    var scaleY = bounds.size.y / canvas.height;
    var scale = Math.max(scaleX, scaleY) * 1.2;
    if (scale < 1) scale = 1;
    var width = canvas.width * scale;
    var height = canvas.height * scale;

    mvp.ortho2d(centerX - width / 2, centerY - height / 2, width, height);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

$(() => {
    $.get(jsPath+'fairys.json', dataType="json", success=(data) => {
        fairys = data;
        var skeletonList = $("#skeletonList");
        var sorted = [];
        var sortmaps = {};
        for (var id in fairys) {
            var fairy = fairys[id];
            sorted.push(fairy.name);
            sortmaps[fairy.name] = id;
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
            activeSkeleton = skeletonList.val();
            // Tell AssetManager to load the resources for each skeleton, including the exported .skel file, the .atlas file and the .png
            // file for the atlas. We then wait until all resources are loaded in the load() method.
            if (!skeletons[activeSkeleton]) {
                var fairy = fairys[activeSkeleton];
                if (fairy.type === "binary")
                    assetManager.loadBinary(jsPath+`skels/${activeSkeleton}/0.${fairy.ext}`);
                else if (fairy.type === "text")
                    assetManager.loadText(jsPath+`skels/${activeSkeleton}/0.${fairy.ext}`);
                assetManager.loadTextureAtlas(jsPath+`skels/${activeSkeleton}/0.atlas`);
            }
            requestAnimationFrame(load);
        })
        activeSkeleton = skeletonList.val();
        init();
        skeletonList.change();
    });
});
