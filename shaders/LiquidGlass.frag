// Original Shader: https://www.shadertoy.com/view/wccSDf

#pragma header

#define iResolution vec3(openfl_TextureSize, 0.)
#define iChannel0 bitmap
#define texture flixel_texture2D

// variables which are empty, they need just to avoid crashing shader
uniform vec4 iMouse;

uniform float blurAmount;

// --- NEW CAPSULE UNIFORMS ---
// These control the total width and height of the glass capsule shape.
uniform float capsuleWidth;
uniform float capsuleHeight;
// --- END NEW CAPSULE UNIFORMS ---

// --- NEW DISTORTION UNIFORM ---
// Controls the magnitude of the refraction effect (how much the background shifts).
uniform float distortionIntensity;
// --- END NEW DISTORTION UNIFORM ---

// --- NEW COLOR TINT UNIFORMS ---
// RGB color value for the tint (e.g., from a Hex code like #FF0000 -> vec3(1.0, 0.0, 0.0))
uniform vec3 tintColorRGB;
// How much to mix the tint color into the final result (0.0 to 1.0)
uniform float tintMixAmount;
// --- END NEW COLOR TINT UNIFORMS ---

// end of ShadertoyToFlixel header

// SDF of a rounded rectangle. Shamelessly copied from https://iquilezles.org/articles/distfunctions/.
// 'size' is the half-extent of the inner box (before rounding).
// 'r' is the rounding radius.
float sdfRect(vec2 center, vec2 size, vec2 p, float r)
{
    vec2 p_rel = p - center;
    vec2 q = abs(p_rel) - size;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Thickness is the t in the doc.
vec3 getNormal(float sd, float thickness)
{
    float dx = dFdx(sd);
    float dy = dFdy(sd);

    // The cosine and sine between normal and the xy plane.
    float n_cos = max(thickness + sd, 0.0) / thickness;
    float n_sin = sqrt(1.0 - n_cos * n_cos);

    return normalize(vec3(dx * n_cos, dy * n_cos, n_sin));
}

// The height (z component) of the pad surface at sd.
float height(float sd, float thickness)
{
    if(sd >= 0.0)
    {
        return 0.0;
    }
    if(sd < -thickness)
    {
        return thickness;
    }

    float x = thickness + sd;
    return sqrt(thickness * thickness - x * x);
}

// --- NEW BLUR FUNCTION ---
// Simple 9-tap box blur
vec4 blurBackground(vec2 uv, float radius)
{
    vec4 sum = vec4(0.0);
    // Use the reciprocal of the resolution to get the texture step size
    vec2 texel_size = 1.0 / iResolution.xy;
    
    // A simple 3x3 kernel (9 taps)
    for (int i = -1; i <= 1; i++) {
        for (int j = -1; j <= 1; j++) {
            // Sample around the UV coordinate
            vec2 offset = vec2(float(i), float(j)) * texel_size * radius;
            sum += texture(iChannel0, uv + offset);
        }
    }
    // Divide by the number of samples (9)
    return sum / 9.0;
}
// --- END NEW BLUR FUNCTION ---

vec4 bgImage(vec2 uv)
{
    return texture(iChannel0, uv);
}

// MODIFIED: This function now takes a bool to decide if it should be blurred
vec4 bg(vec2 uv, bool should_blur)
{
    if (should_blur) {
        // Blur radius control: Adjust 1.5 to change blur strength
        return blurBackground(uv, blurAmount);
    }
    return bgImage(uv);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord / iResolution.xy;

    float thickness = 14.0;
    float index = 1.5;
    float base_height = thickness * 8.0;
    float color_mix = 0.3;
    vec4 color_base = vec4(1.0, 1.0, 1.0, 0.0);
    
    vec2 center = iMouse.xy;
    if(center == vec2(0.0, 0.0))
    {
        center = iResolution.xy * 0.5;
    }
    
    // --- CAPSULE GEOMETRY LOGIC ---
    // 1. Calculate the half-dimensions
    float halfW = capsuleWidth * 0.5;
    float halfH = capsuleHeight * 0.5;
    
    // 2. The radius 'R' for a perfect capsule is half of the smaller dimension.
    float R = min(halfW, halfH);
    
    // 3. The 'size' vector for sdfRect defines the straight section's half-extent.
    // We subtract the radius R from the longer half-dimension to find this extent.
    float sizeX = max(0.0, halfW - R);
    float sizeY = max(0.0, halfH - R);
    vec2 sizeVec = vec2(sizeX, sizeY); 
    
    // 4. Call the SDF with the calculated variables
    float sd = sdfRect(center, sizeVec, fragCoord, R);
    // --- END CAPSULE GEOMETRY LOGIC ---
    
    
    // Background pass-through with anti-aliasing (uses UNBLURRED background)
    // The background visible *outside* the glass effect should remain sharp.
    vec4 bg_col = vec4(0.);
    // Use UNBLURRED background for the areas *outside* the glass.
    bg_col = mix(vec4(0.0), bg(uv, false),clamp(sd / 100.0, 0.0, 1.0) * 0.1 + 0.9);
    bg_col.a = smoothstep(-4.,0.,sd);
    
    vec3 normal = getNormal(sd, thickness);
    
    // A ray going -z hits the top of the pad, where would it hit on
    // the z = -base_height plane?
    vec3 incident = vec3(0.0, 0.0, -1.0); // Should be normalized.
    
    // --- DISTORTION MODIFICATION ---
    // Calculate the refracted vector using the material's index
    vec3 refract_vec_unscaled = refract(incident, normal, 1.0 / index);
    
    float h = height(sd, thickness);
    float refract_length = (h + base_height) /
        dot(vec3(0.0, 0.0, -1.0), refract_vec_unscaled);
    
    // Calculate the total offset that would normally be applied (original distortion)
    vec2 original_offset = refract_vec_unscaled.xy * refract_length;
    
    // Scale the offset by the distortionIntensity
    vec2 scaled_offset = original_offset * distortionIntensity;
    
    // This is the screen coord of the ray hitting the z = -base_height plane.
    vec2 coord1 = fragCoord + scaled_offset;

    // Use the BLURRED background for the refracted color
    vec4 refract_color = bg(coord1 / iResolution.xy, true);

    // Reflection
    vec3 reflect_vec = reflect(incident, normal);
    float c = clamp(abs(reflect_vec.x - reflect_vec.y), 0.0, 1.0);
    vec4 reflect_color = vec4(c,c,c, 0.0);

    // Final color calculation (before antialiasing mix)
    vec4 final_glass_color = mix(mix(refract_color, reflect_color, (1.0 - normal.z) * 2.0),
                                 color_base, color_mix);
    
    // --- APPLY COLOR TINT ---
    // Mix the RGB of the final glass color with the uniform tint color
    final_glass_color.rgb = mix(final_glass_color.rgb, tintColorRGB.rgb, tintMixAmount);
    
    // --- FIX: Explicitly set the alpha channel for the glass area ---
    // This ensures the fragment is opaque inside the glass shape.
    final_glass_color.a = 1.0 - smoothstep(-4., 0., sd);

    fragColor = final_glass_color;
                    
    // Mix with UNBLURRED bg for anti-aliasing
    fragColor = clamp(fragColor,0.,1.);
    bg_col = clamp(bg_col,0.,1.);
    fragColor = mix(fragColor,bg_col,bg_col.a);
}

void main() {
    mainImage(gl_FragColor, openfl_TextureCoordv*openfl_TextureSize);
}