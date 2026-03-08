// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PayableAPI - On-chain payment gate for AI API access
/// @notice Records USDC payments for API endpoints, enabling x402 verification
contract PayableAPI {
    address public owner;
    address public usdcToken;

    struct Payment {
        address payer;
        uint256 amount;
        string endpoint;
        uint256 timestamp;
    }

    struct Endpoint {
        string name;
        uint256 price; // in USDC smallest unit (6 decimals)
        bool active;
    }

    Payment[] public payments;
    Endpoint[] public endpoints;
    mapping(address => uint256) public userPaymentCount;
    mapping(address => uint256) public userTotalSpent;

    uint256 public totalRevenue;

    event PaymentReceived(
        uint256 indexed paymentId,
        address indexed payer,
        uint256 amount,
        string endpoint
    );
    event EndpointAdded(uint256 indexed endpointId, string name, uint256 price);
    event EndpointUpdated(uint256 indexed endpointId, bool active, uint256 price);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _usdcToken) {
        owner = msg.sender;
        usdcToken = _usdcToken;
    }

    /// @notice Register a new API endpoint with its price
    function addEndpoint(string calldata name, uint256 price) external onlyOwner {
        endpoints.push(Endpoint(name, price, true));
        emit EndpointAdded(endpoints.length - 1, name, price);
    }

    /// @notice Update an endpoint's status or price
    function updateEndpoint(uint256 id, bool active, uint256 price) external onlyOwner {
        require(id < endpoints.length, "Invalid endpoint");
        endpoints[id].active = active;
        endpoints[id].price = price;
        emit EndpointUpdated(id, active, price);
    }

    /// @notice Pay for API access - caller must approve USDC first
    function payForAPI(uint256 endpointId) external {
        require(endpointId < endpoints.length, "Invalid endpoint");
        Endpoint storage ep = endpoints[endpointId];
        require(ep.active, "Endpoint inactive");

        // Transfer USDC from payer to this contract
        (bool success, ) = usdcToken.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender,
                address(this),
                ep.price
            )
        );
        require(success, "USDC transfer failed");

        payments.push(Payment(msg.sender, ep.price, ep.name, block.timestamp));
        userPaymentCount[msg.sender]++;
        userTotalSpent[msg.sender] += ep.price;
        totalRevenue += ep.price;

        emit PaymentReceived(payments.length - 1, msg.sender, ep.price, ep.name);
    }

    /// @notice Direct USDC payment with custom amount and endpoint name
    function recordPayment(address payer, uint256 amount, string calldata endpoint) external onlyOwner {
        payments.push(Payment(payer, amount, endpoint, block.timestamp));
        userPaymentCount[payer]++;
        userTotalSpent[payer] += amount;
        totalRevenue += amount;

        emit PaymentReceived(payments.length - 1, payer, amount, endpoint);
    }

    /// @notice Withdraw collected USDC
    function withdraw(uint256 amount) external onlyOwner {
        (bool success, ) = usdcToken.call(
            abi.encodeWithSignature("transfer(address,uint256)", owner, amount)
        );
        require(success, "Withdraw failed");
    }

    function totalPayments() external view returns (uint256) {
        return payments.length;
    }

    function totalEndpoints() external view returns (uint256) {
        return endpoints.length;
    }

    function getPayment(uint256 id) external view returns (
        address payer, uint256 amount, string memory endpoint, uint256 timestamp
    ) {
        Payment storage p = payments[id];
        return (p.payer, p.amount, p.endpoint, p.timestamp);
    }

    function getEndpoint(uint256 id) external view returns (
        string memory name, uint256 price, bool active
    ) {
        Endpoint storage ep = endpoints[id];
        return (ep.name, ep.price, ep.active);
    }
}
