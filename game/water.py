"""One exact lake boundary for authoritative walkers and boat segments.

Optional absolute outlines replace the legacy ellipse. Optional elliptical
islands are dry holes. Geometry and clearance agree with web/water.js.
"""
import math

EPS = 1e-9
TAU = math.pi * 2


def _finite(*values):
    return all(isinstance(v, (int, float)) and math.isfinite(v) for v in values)


def normalized(lake, x, y, inset=0):
    try:
        rx, ry = lake['radius_x'] - inset, lake['radius_y'] - inset
        rotation = lake.get('rotation', 0)
        if not _finite(x, y, lake['x'], lake['y'], rx, ry, rotation) or rx <= 0 or ry <= 0:
            return None
        cosine, sine = math.cos(rotation), math.sin(rotation)
        dx, dy = x - lake['x'], y - lake['y']
        return (cosine * dx + sine * dy) / rx, (-sine * dx + cosine * dy) / ry
    except (KeyError, TypeError):
        return None


def _outline(lake):
    points = lake.get('outline')
    return points if (isinstance(points, list) and len(points) >= 3 and
                      all(isinstance(p, (list, tuple)) and len(p) >= 2 and _finite(*p[:2]) for p in points)) else None


def _islands(lake):
    return [i for i in lake.get('islands', []) if isinstance(i, dict) and normalized(i, i.get('x'), i.get('y'))]


def _edge_projection(point, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    t = max(0, min(1, ((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)) if length else 0
    x, y = a[0] + dx*t, a[1] + dy*t
    return x, y, math.hypot(point[0]-x, point[1]-y)


def _polygon_measure(points, x, y):
    inside, distance = False, math.inf
    for i, b in enumerate(points):
        a = points[i-1]
        distance = min(distance, _edge_projection((x, y), a, b)[2])
        if (a[1] > y) != (b[1] > y) and x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside, distance


def lake_contains(lake, x, y, inset=0):
    if not _finite(x, y, inset):
        return False
    outline = _outline(lake)
    if outline:
        inside, distance = _polygon_measure(outline, x, y)
        wet = inside and distance > inset+EPS if inset >= 0 else inside or distance < -inset-EPS
    else:
        p = normalized(lake, x, y, inset)
        wet = bool(p and p[0]*p[0]+p[1]*p[1] < 1-1e-10)
    if not wet:
        return False
    for island in _islands(lake):
        p = normalized(island, x, y, -inset)
        if p and p[0]*p[0]+p[1]*p[1] <= 1+1e-10:
            return False
    return True


def _quadratic_roots(a, b, c, out):
    if abs(a) < EPS:
        if abs(b) > EPS:
            out.append(-c/b)
        return
    discriminant = b*b-4*a*c
    if discriminant < -EPS:
        return
    root = math.sqrt(max(0, discriminant))
    out.extend(((-b-root)/(2*a), (-b+root)/(2*a)))


def _ellipse_breaks(ellipse, start, end, inset, out):
    a, b = normalized(ellipse, *start, inset), normalized(ellipse, *end, inset)
    if not a or not b:
        return
    dx, dy = b[0]-a[0], b[1]-a[1]
    _quadratic_roots(dx*dx+dy*dy, 2*(a[0]*dx+a[1]*dy), a[0]*a[0]+a[1]*a[1]-1, out)


def _polygon_breaks(points, start, end, inset, out):
    vx, vy, radius = end[0]-start[0], end[1]-start[1], abs(inset)
    for i, a in enumerate(points):
        b = points[(i+1) % len(points)]
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dy)
        if not length:
            continue
        nx, ny = -dy/length, dx/length
        d0, dv = (start[0]-a[0])*nx+(start[1]-a[1])*ny, vx*nx+vy*ny
        if abs(dv) > EPS:
            for offset in (-radius, radius) if radius else (0,):
                t = (offset-d0)/dv
                projection = ((start[0]+vx*t-a[0])*dx+(start[1]+vy*t-a[1])*dy)/(length*length)
                if -EPS <= projection <= 1+EPS:
                    out.append(t)
        if radius:
            ux, uy = start[0]-a[0], start[1]-a[1]
            _quadratic_roots(vx*vx+vy*vy, 2*(ux*vx+uy*vy), ux*ux+uy*uy-radius*radius, out)


def _segment_breaks(lake, start, end, inset):
    values, outline = [0, 1], _outline(lake)
    if outline:
        _polygon_breaks(outline, start, end, inset, values)
    else:
        _ellipse_breaks(lake, start, end, inset, values)
    for island in _islands(lake):
        _ellipse_breaks(island, start, end, -inset, values)
    ordered = sorted(v for v in values if math.isfinite(v) and 0 <= v <= 1)
    unique = []
    for value in ordered:
        if not unique or value-unique[-1] > 1e-12:
            unique.append(value)
    return unique


def _along(start, end, t):
    return start[0]+(end[0]-start[0])*t, start[1]+(end[1]-start[1])*t


def segment_crosses_lake(lake, start, end, inset=0):
    if not _finite(*start, *end, inset):
        return False
    if lake_contains(lake, *start, inset) or lake_contains(lake, *end, inset):
        return True
    points = _segment_breaks(lake, start, end, inset)
    return any(lake_contains(lake, *_along(start, end, (a+b)/2), inset) for a, b in zip(points, points[1:]))


def segment_stays_in_lake(lake, start, end, inset=12):
    """Every point on a boat's swept segment must remain navigable water."""
    if not lake_contains(lake, *start, inset) or not lake_contains(lake, *end, inset):
        return False
    points = _segment_breaks(lake, start, end, inset)
    return (all(lake_contains(lake, *_along(start, end, (a+b)/2), inset) for a, b in zip(points, points[1:])) and
            all(lake_contains(lake, *_along(start, end, t), inset) for t in points[1:-1]))


def _walkways(lake):
    return [w for w in lake.get('walkways', []) if isinstance(w,dict) and
            _finite(w.get('width')) and w['width']>0 and
            isinstance(w.get('points'),list) and len(w['points'])>=2 and
            all(isinstance(p,(list,tuple)) and len(p)>=2 and _finite(*p[:2]) for p in w['points'])]


def _walkway_contains(lake, x, y):
    return any(_edge_projection((x,y),a,b)[2]<=w['width']/2+EPS for w in _walkways(lake)
               for a,b in zip(w['points'],w['points'][1:]))


_PEDESTRIAN_GEOMETRY = []


def _polynomial_roots(coefficients):
    p=list(coefficients);scale=max([abs(v) for v in p]+[1e-30])
    while len(p)>1 and abs(p[-1])<=scale*1e-12:p.pop()
    if len(p)<=1:return []
    if len(p)==2:return [-p[0]/p[1]]
    def value(x):
        result=0
        for n in reversed(p):result=result*x+n
        return result
    limit=1+max(abs(n/p[-1]) for n in p[:-1])
    critical=sorted(x for x in _polynomial_roots([n*(i+1) for i,n in enumerate(p[1:])]) if -limit<x<limit)
    cuts=[-limit,*critical,limit];roots=[x for x in critical if abs(value(x))<=scale*1e-9]
    for low,high in zip(cuts,cuts[1:]):
        a,b=value(low),value(high)
        if not _finite(a,b) or a*b>0:continue
        for _ in range(80):
            mid=(low+high)/2;v=value(mid)
            if a*v<=0:high,b=mid,v
            else:low,a=mid,v
        roots.append((low+high)/2)
    return roots


def _curve_ellipse_angles(curve,ellipse,out):
    c=normalized(ellipse,*_ellipse_point(curve,0))
    opposite=normalized(ellipse,*_ellipse_point(curve,math.pi))
    quarter=normalized(ellipse,*_ellipse_point(curve,math.pi/2))
    if not c or not opposite or not quarter:return
    cx,cy=(c[0]+opposite[0])/2,(c[1]+opposite[1])/2
    ux,uy=(c[0]-opposite[0])/2,(c[1]-opposite[1])/2
    vx,vy=quarter[0]-cx,quarter[1]-cy
    a,b,cross=ux*ux+uy*uy,vx*vx+vy*vy,2*(ux*vx+uy*vy)
    d,e,f=2*(cx*ux+cy*uy),2*(cx*vx+cy*vy),cx*cx+cy*cy-1
    out.extend((2*math.atan(t)+TAU)%TAU for t in _polynomial_roots([a+d+f,2*(cross+e),-2*a+4*b+2*f,2*(e-cross),a-d+f]))


def _curve_line_angles(curve,a,b,out):
    dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
    if not length:return
    p,q=_ellipse_point(curve,0),_ellipse_point(curve,math.pi/2)
    nx,ny=-dy/length,dx/length
    d=(curve['x']-a[0])*nx+(curve['y']-a[1])*ny
    u=(p[0]-curve['x'])*nx+(p[1]-curve['y'])*ny
    v=(q[0]-curve['x'])*nx+(q[1]-curve['y'])*ny;h=math.hypot(u,v)
    if not h or abs(d)>h+EPS:return
    phi,angle=math.atan2(v,u),math.acos(min(1,max(-1,-d/h)))
    for theta in (phi-angle,phi+angle):
        px,py=_ellipse_point(curve,theta);t=((px-a[0])*dx+(py-a[1])*dy)/(length*length)
        if -EPS<=t<=1+EPS:out.append((theta+TAU)%TAU)


def _unique_sorted(values,tolerance=1e-10):
    result=[]
    for value in sorted(v for v in values if math.isfinite(v)):
        if not result or value-result[-1]>tolerance:result.append(value)
    return result


def _curve_cuts(curve,geometry):
    values=[0,math.pi,TAU]
    for a,b in geometry['lines']:_curve_line_angles(curve,a,b,values)
    for ellipse in geometry['curves']:
        if ellipse is not curve:_curve_ellipse_angles(curve,ellipse,values)
    return _unique_sorted(values)


def _line_cuts(a,b,geometry):
    values=[0,1]
    for p,q in geometry['lines']:_polygon_breaks([p,q],a,b,0,values)
    for ellipse in geometry['curves']:_ellipse_breaks(ellipse,a,b,0,values)
    return _unique_sorted(v for v in values if 0<=v<=1)


def _foot_geometry(lake):
    # Authored geometry is immutable, just like the browser's WeakMap cache.
    # Keep a bounded identity cache so temporary test lakes cannot accumulate.
    for source,geometry in _PEDESTRIAN_GEOMETRY:
        if source is lake:return geometry
    lines,curves=[],[];outline=_outline(lake)
    if outline:
        lines.extend((a,outline[(i+1)%len(outline)]) for i,a in enumerate(outline))
        xs,ys=zip(*outline);bounds=(min(xs),min(ys),max(xs)-min(xs),max(ys)-min(ys))
    elif normalized(lake,lake.get('x'),lake.get('y')):
        curves.append(lake);cosine,sine=math.cos(lake.get('rotation',0)),math.sin(lake.get('rotation',0))
        rx=math.hypot(lake['radius_x']*cosine,lake['radius_y']*sine)
        ry=math.hypot(lake['radius_x']*sine,lake['radius_y']*cosine)
        bounds=(lake['x']-rx,lake['y']-ry,rx*2,ry*2)
    else:bounds=None
    curves.extend(_islands(lake))
    for walkway in _walkways(lake):
        for a,b in zip(walkway['points'],walkway['points'][1:]):
            dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);r=walkway['width']/2
            if not length:continue
            nx,ny=-dy*r/length,dx*r/length
            lines.extend((((a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny)),((a[0]-nx,a[1]-ny),(b[0]-nx,b[1]-ny))))
            curves.extend({'x':p[0],'y':p[1],'radius_x':r,'radius_y':r,'rotation':0} for p in (a,b))
    geometry={'lines':lines,'curves':curves,'bounds':bounds,'seeds':[]}
    _PEDESTRIAN_GEOMETRY.append((lake,geometry))
    if len(_PEDESTRIAN_GEOMETRY)>8:_PEDESTRIAN_GEOMETRY.pop(0)
    def seed(point,nx,ny):
        for sign in (-1,1):
            q=(point[0]+nx*sign*1e-5,point[1]+ny*sign*1e-5)
            if lake_contains(lake,*q) and not _walkway_contains(lake,*q):geometry['seeds'].append(q)
    # One wet-side seed per boundary fragment detects a whole tiny wet region
    # inside a foot or capsule even when its perimeter remains entirely dry.
    for a,b in lines:
        dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
        if not length:continue
        cuts=_line_cuts(a,b,geometry)
        for low,high in zip(cuts,cuts[1:]):seed(_along(a,b,(low+high)/2),-dy/length,dx/length)
    for curve in curves:
        cuts=_curve_cuts(curve,geometry)
        for low,high in zip(cuts,cuts[1:]):
            theta=(low+high)/2;p=_ellipse_point(curve,theta);q=_ellipse_point(curve,theta+1e-5)
            dx,dy=q[0]-p[0],q[1]-p[1];length=math.hypot(dx,dy)
            if length:seed(p,-dy/length,dx/length)
    return geometry


def _foot_circle_crosses_water(lake,x,y,radius):
    geometry=_foot_geometry(lake);bounds=geometry['bounds']
    if bounds is None:return False
    bx,by,w,h=bounds
    if x+radius<bx or x-radius>bx+w or y+radius<by or y-radius>by+h:return False
    wet=lambda p:lake_contains(lake,*p) and not _walkway_contains(lake,*p)
    if wet((x,y)):return True
    curve={'x':x,'y':y,'radius_x':radius,'radius_y':radius,'rotation':0};cuts=_curve_cuts(curve,geometry)
    if any(wet(_ellipse_point(curve,(a+b)/2)) for a,b in zip(cuts,cuts[1:])):return True
    return any((px-x)**2+(py-y)**2<(radius-1e-7)**2 for px,py in geometry['seeds'])


def pedestrian_lake_contains(lake, x, y, radius=0):
    """Water blocks a complete foot in the union of dry ground and bridges."""
    if _finite(x,y,radius) and radius>0:return _foot_circle_crosses_water(lake,x,y,radius)
    return lake_contains(lake,x,y) and not _walkway_contains(lake,x,y)


def pedestrian_segment_crosses_lake(lake, start, end, radius=0):
    if not _finite(*start,*end):
        return False
    if radius>0:
        if (pedestrian_lake_contains(lake,*start,radius) or pedestrian_lake_contains(lake,*end,radius) or
                pedestrian_segment_crosses_lake(lake,start,end)):return True
        dx,dy=end[0]-start[0],end[1]-start[1];length=math.hypot(dx,dy)
        if not length:return False
        nx,ny=-dy*radius/length,dx*radius/length
        if any(pedestrian_segment_crosses_lake(lake,(start[0]+nx*sign,start[1]+ny*sign),
                 (end[0]+nx*sign,end[1]+ny*sign)) for sign in (-1,1)):return True
        return any(_edge_projection(p,start,end)[2]<radius-1e-7 for p in _foot_geometry(lake)['seeds'])
    if pedestrian_lake_contains(lake,*start) or pedestrian_lake_contains(lake,*end):
        return True
    values=_segment_breaks(lake,start,end,0)
    for walkway in _walkways(lake):
        for a,b in zip(walkway['points'],walkway['points'][1:]):
            _polygon_breaks([a,b],start,end,walkway['width']/2,values)
    ordered=sorted(v for v in values if math.isfinite(v) and 0<=v<=1)
    unique=[]
    for value in ordered:
        if not unique or value-unique[-1]>1e-12:unique.append(value)
    return any(pedestrian_lake_contains(lake,*_along(start,end,(a+b)/2)) for a,b in zip(unique,unique[1:]))


def _ellipse_point(ellipse, theta):
    cosine, sine = math.cos(ellipse.get('rotation', 0)), math.sin(ellipse.get('rotation', 0))
    u, v = ellipse['radius_x']*math.cos(theta), ellipse['radius_y']*math.sin(theta)
    return ellipse['x']+cosine*u-sine*v, ellipse['y']+sine*u+cosine*v


def _nearest_ellipse_boundary(ellipse, point):
    step = TAU/64
    def distance(t):
        p = _ellipse_point(ellipse, t)
        return (p[0]-point[0])**2+(p[1]-point[1])**2
    best = min(range(64), key=lambda i: distance(i*step))*step
    low, high = best-step, best+step
    for _ in range(45):
        a, b = (2*low+high)/3, (low+2*high)/3
        if distance(a) <= distance(b): high = b
        else: low = a
    theta = (low+high)/2
    x, y = _ellipse_point(ellipse, theta)
    cosine, sine = math.cos(ellipse.get('rotation', 0)), math.sin(ellipse.get('rotation', 0))
    u, v = math.cos(theta)/ellipse['radius_x'], math.sin(theta)/ellipse['radius_y']
    length = math.hypot(u, v)
    return x, y, (cosine*u-sine*v)/length, (sine*u+cosine*v)/length, math.hypot(point[0]-x, point[1]-y)


def nearest_shore(lake, x, y, padding=18):
    if not _finite(x, y, padding):
        return x, y
    outline, holes = _outline(lake), _islands(lake)
    if not outline and not holes:
        p = normalized(lake, x, y)
        if not p: return x, y
        u, v = p
        length = math.hypot(u, v)
        u, v = (u/length, v/length) if length else (0, 1)
        dx, dy = u*(lake['radius_x']+padding), v*(lake['radius_y']+padding)
        cosine, sine = math.cos(lake.get('rotation', 0)), math.sin(lake.get('rotation', 0))
        return lake['x']+cosine*dx-sine*dy, lake['y']+sine*dx+cosine*dy
    candidates = []
    if outline:
        area = sum(a[0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*a[1] for i,a in enumerate(outline))
        sign = 1 if area >= 0 else -1
        for i, a in enumerate(outline):
            b = outline[(i+1)%len(outline)]
            dx, dy = b[0]-a[0], b[1]-a[1]
            length = math.hypot(dx, dy)
            if length:
                px, py, distance = _edge_projection((x,y), a, b)
                candidates.append((px,py,sign*dy/length,-sign*dx/length,distance))
    elif normalized(lake, x, y):
        candidates.append(_nearest_ellipse_boundary(lake, (x,y)))
    for island in holes:
        px,py,nx,ny,distance = _nearest_ellipse_boundary(island,(x,y))
        candidates.append((px,py,-nx,-ny,distance))
    for px,py,nx,ny,_ in sorted(candidates,key=lambda p:p[4]):
        next_point = px+nx*padding, py+ny*padding
        wet = lake_contains(lake,*next_point)
        if (not wet) if padding >= 0 else wet:
            return next_point
    return x,y


def nearest_pedestrian_shore(lake,x,y,radius=14,allowed=lambda p:True):
    """Keep a restored foot on its local bank, island or bridge landing."""
    if not pedestrian_lake_contains(lake,x,y,radius) and allowed((x,y)):return x,y
    candidates=[];padding=radius+4;outline=_outline(lake)
    if outline:
        area=sum(a[0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*a[1] for i,a in enumerate(outline))
        sign=1 if area>=0 else -1
        for i,a in enumerate(outline):
            b=outline[(i+1)%len(outline)];dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
            if not length:continue
            px,py,_=_edge_projection((x,y),a,b)
            candidates.append((px+sign*dy*padding/length,py-sign*dx*padding/length))
            distance=math.hypot(x-a[0],y-a[1])
            if distance:candidates.append((a[0]+(x-a[0])*padding/distance,a[1]+(y-a[1])*padding/distance))
    elif normalized(lake,x,y):
        px,py,nx,ny,_=_nearest_ellipse_boundary(lake,(x,y));candidates.append((px+nx*padding,py+ny*padding))
    for island in _islands(lake):
        px,py,nx,ny,_=_nearest_ellipse_boundary(island,(x,y));candidates.append((px-nx*padding,py-ny*padding))
    for walkway in _walkways(lake):
        for a,b in zip(walkway['points'],walkway['points'][1:]):
            px,py,_=_edge_projection((x,y),a,b);margin=walkway['width']/2-radius
            if margin<0:continue
            distance=math.hypot(x-px,y-py);scale=min(1,margin/distance) if distance else 0
            candidates.extend(((px+(x-px)*scale,py+(y-py)*scale),(px,py)))
    return min((p for p in candidates if not pedestrian_lake_contains(lake,*p,radius) and allowed(p)),
               key=lambda p:(math.hypot(p[0]-x,p[1]-y),p[1],p[0]),default=nearest_shore(lake,x,y,padding))
