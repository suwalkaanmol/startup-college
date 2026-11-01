import React from 'react';
import { IconVeg, IconNonVeg, IconPlus, IconMinus, IconUtensils } from './Icons';
import { resolveImageUrl } from '../api';
import { getNormalizedDiet } from '../dietary';

/**
 * Validates whether an image genuinely matches the dish.
 * Prevents reusing one generic fried-rice photo or paratha photo across unrelated dishes.
 * For dishes without an authentic matching photograph, returns null so the neutral
 * SVG dish placeholder is displayed instead.
 */
function getMatchingDishImage(item) {
  if (!item || !item.image_url) return null;

  const rawUrl = item.image_url.toLowerCase();
  const itemName = (item.name || '').toLowerCase().trim();

  // 1. Fried rice image: only display for actual plain/veg Fried Rice
  if (rawUrl.includes('fried-rice')) {
    const isAuthenticFriedRice = itemName === 'veg fried rice' || itemName === 'fried rice';
    return isAuthenticFriedRice ? item.image_url : null;
  }

  // 2. Cheese balls image: only display for actual Cheese Balls
  if (rawUrl.includes('cheese-balls')) {
    const isCheeseBall = itemName.includes('cheese ball');
    return isCheeseBall ? item.image_url : null;
  }

  // 3. Paneer 65 image: only display for actual Paneer 65
  if (rawUrl.includes('panner-65') || rawUrl.includes('paneer-65')) {
    const isPaneer65 = itemName.includes('65') && (itemName.includes('pan') || itemName.includes('panner'));
    return isPaneer65 ? item.image_url : null;
  }

  // 4. Stuffed garlic cheese paratha: only display for Garlic Cheese Paratha
  if (rawUrl.includes('stuffed-paratha-garlic-cheese')) {
    const isGarlicCheese = itemName.includes('garlic') && itemName.includes('cheese');
    return isGarlicCheese ? item.image_url : null;
  }

  // 5. Chilli cheese paratha: only display for Cheese Paratha
  if (rawUrl.includes('chilli-cheese-paratha')) {
    const isCheeseParatha = itemName.includes('cheese paratha');
    return isCheeseParatha ? item.image_url : null;
  }

  // 6. Pav Bhaji: only display for Pav Bhaji
  if (rawUrl.includes('pav-bhaji')) {
    const isPavBhaji = itemName === 'pav bhaji';
    return isPavBhaji ? item.image_url : null;
  }

  // 7. Vada Pav: only display for Vada Pav
  if (rawUrl.includes('vada-pav')) {
    const isVadaPav = itemName === 'vada pav';
    return isVadaPav ? item.image_url : null;
  }

  // 8. Generic Indo-Chinese starters photo: does not represent specific dishes
  if (rawUrl.includes('indo-chinese-starters')) {
    return null;
  }

  // 9. Noodles photo: only display for Veg Noodles
  if (rawUrl.includes('noodles')) {
    const isVegNoodles = itemName === 'veg noodles' || itemName === 'noodles';
    return isVegNoodles ? item.image_url : null;
  }

  // 10. Rolls photo: only display for Veg Roll
  if (rawUrl.includes('rolls')) {
    const isVegRoll = itemName === 'veg roll' || itemName === 'roll';
    return isVegRoll ? item.image_url : null;
  }

  // 11. Wai Wai & Maggi photo: only display for plain Maggi or plain Wai Wai
  if (rawUrl.includes('wai-wai-maggi')) {
    const isPlainMaggiOrWaiWai = itemName === 'maggi' || itemName === 'wai wai (plain)';
    return isPlainMaggiOrWaiWai ? item.image_url : null;
  }

  // 12. Mac and cheese photo: only display for Classic Mac & Cheese
  if (rawUrl.includes('mac-and-cheese')) {
    const isClassicMac = itemName === 'classic mac & cheese';
    return isClassicMac ? item.image_url : null;
  }

  // 13. Chatpata bhel photo: only display for Chatpata Bhel
  if (rawUrl.includes('chatpata-bhel')) {
    const isBhel = itemName.includes('bhel');
    return isBhel ? item.image_url : null;
  }

  return item.image_url;
}

export function FoodCard({
  item,
  cartQuantity,
  onAddToCart,
  onUpdateQuantity,
  canteen
}) {
  const verifiedImage = getMatchingDishImage(item);
  const imageUrl = resolveImageUrl(verifiedImage);
  const [imgLoaded, setImgLoaded] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
  }, [item?.id, imageUrl]);

  const isSoldOut = item.stock_quantity <= 0;
  const isUnavailable = !item.is_available && item.stock_quantity > 0;
  const isOutOfStock = isSoldOut || !item.is_available;
  const diet = getNormalizedDiet(item, canteen);

  return (
    <div className={`food-card ${isOutOfStock ? 'food-card-out-of-stock' : ''}`}>
      {/* Food Image with Fallback */}
      <div className="food-img-wrap">
        {imageUrl && !imgError && (
          <img
            src={imageUrl}
            alt={item.name}
            className={`food-img ${imgLoaded ? 'food-img-loaded' : 'food-img-loading'}`}
            style={{ display: imgLoaded ? 'block' : 'none' }}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        )}

        {/* Neutral Fallback Placeholder (Used while loading, on error, or when no matching photo exists) */}
        {(!imageUrl || imgError || !imgLoaded) && (
          <div
            className="food-img-placeholder"
            style={{ display: 'flex' }}
          >
            <div className="placeholder-icon-wrap">
              <IconUtensils size={28} className="w-8 h-8 text-orange-400" />
            </div>
            <span className="placeholder-cat">{item.category}</span>
          </div>
        )}

        {/* Dietary Tag Indicator Top Left */}
        <div className="diet-badge-container">
          {diet === 'veg' && <IconVeg size={16} />}
          {diet === 'non-veg' && <IconNonVeg size={16} />}
        </div>

        {/* Stock / Sold Out / Unavailable Badge */}
        {isSoldOut ? (
          <span className="stock-badge stock-badge-soldout">Sold Out</span>
        ) : isUnavailable ? (
          <span className="stock-badge stock-badge-unavailable">Unavailable</span>
        ) : item.stock_quantity <= 5 ? (
          <span className="stock-badge stock-badge-low">Only {item.stock_quantity} Left</span>
        ) : (
          <span className="stock-badge stock-badge-available">{item.stock_quantity} In Stock</span>
        )}
      </div>

      {/* Card Content */}
      <div className="food-card-body">
        <div className="food-header-row">
          <span className="food-category-tag">{item.category}</span>
        </div>

        <h4 className="food-name" title={item.name}>{item.name}</h4>

        {item.note && (
          <p className="food-note" title={item.note}>
            ℹ️ {item.note}
          </p>
        )}

        <div className="food-footer-row">
          <div className="food-price-wrap">
            <span className="price-symbol">₹</span>
            <span className="price-value">{Math.round(item.price)}</span>
          </div>

          {/* Cart Quantity Stepper / Add Button */}
          <div className="food-action-wrap">
            {isSoldOut ? (
              <button type="button" disabled className="btn-add-disabled">
                Sold Out
              </button>
            ) : isUnavailable ? (
              <button type="button" disabled className="btn-add-disabled">
                Unavailable
              </button>
            ) : cartQuantity > 0 ? (
              <div className="qty-stepper">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, cartQuantity - 1)}
                  className="stepper-btn"
                  title="Decrease quantity"
                  aria-label={`Decrease quantity of ${item.name}`}
                >
                  <IconMinus size={14} className="w-3.5 h-3.5" />
                </button>
                <span className="stepper-count">{cartQuantity}</span>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.id, cartQuantity + 1)}
                  className="stepper-btn"
                  title="Increase quantity"
                  aria-label={`Increase quantity of ${item.name}`}
                  disabled={cartQuantity >= item.stock_quantity}
                >
                  <IconPlus size={14} className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAddToCart(item)}
                className="btn-add-cart"
                title={`Add ${item.name} to tray`}
                aria-label={`Add ${item.name} to tray`}
              >
                <IconPlus size={16} className="w-4 h-4 mr-1 inline" /> Add
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
